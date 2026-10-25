const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { query, parseJson, withConnection } = require("../db");
const { sanitizeProductHtml, normalizeProductTags } = require("../product-content");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const int = (v, min, max, dflt = 0) => { const n = parseInt(v, 10); return Number.isNaN(n) ? dflt : Math.min(max, Math.max(min, n)); };
const flag = (v) => (v ? 1 : 0);
const slugify = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- images: uploaded files are stored in MySQL ("uploads/<name>"); static ones live in public/images
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ["image/jpeg", "jpg"];
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ["image/png", "png"];
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return ["image/webp", "webp"];
  return null;
}

async function imageOptions() {
  const dir = path.join(__dirname, "..", "..", "public", "images");
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  const media = await query("SELECT name FROM media ORDER BY created_at DESC");
  return [...media.map((m) => `uploads/${m.name}`), ...files];
}

// Returns the image value to store: a new upload wins over the selected one.
async function resolveImage(req, errors) {
  if (req.file) {
    const kind = sniffImage(req.file.buffer);
    if (!kind) { errors.push("Image must be a JPG, PNG or WebP file."); return null; }
    const name = `${crypto.randomBytes(12).toString("hex")}.${kind[1]}`;
    await query("INSERT INTO media (name, mime, data) VALUES (?, ?, ?)", [name, kind[0], req.file.buffer]);
    return `uploads/${name}`;
  }
  const chosen = str(req.body.img, 190);
  if (!/^(uploads\/)?[\w.\-]+\.(jpe?g|png|webp)$/i.test(chosen)) { errors.push("Choose or upload an image."); return null; }
  return chosen;
}

const rows = (body, keys, max = 40) => {
  const out = [];
  for (let i = 0; i < max; i++) {
    const row = Object.fromEntries(keys.map((k) => [k, str(body[`${k}_${i}`], 4000)]));
    if (keys.some((k) => row[k])) out.push(row);
  }
  return out;
};

// Mounted before the CSRF check so the token inside multipart bodies is readable.
const parseMultipart = (req, res, next) => {
  if (!req.admin || !req.is("multipart/form-data")) return next();
  upload.single("image")(req, res, (err) => {
    if (err) req.uploadError = err.code === "LIMIT_FILE_SIZE" ? "Image is larger than 2 MB." : "Upload failed.";
    next();
  });
};

// =============================== services
const svcList = () => query("SELECT s.id, s.name, s.cat, c.name AS cat_name, s.sort_order, s.featured_order, s.published FROM services s JOIN categories c ON c.id = s.cat ORDER BY c.sort_order, s.sort_order, s.name");

router.get("/services", wrap(async (req, res) => {
  res.render("admin/services", { nav: "services", services: await svcList(), saved: req.query.saved === "1" });
}));

const blankService = { id: "", cat: "electric", name: "", img: "", short: "", why: "", perks: [], hub: [], sort_order: 0, featured_order: 0, published: 1 };
async function serviceForm(res, service, extra = {}) {
  const [categories, images] = await Promise.all([query("SELECT id, name FROM categories ORDER BY sort_order"), imageOptions()]);
  res.status(extra.error ? 400 : 200).render("admin/service-form", { nav: "services", service, categories, images, isNew: !service.id || extra.isNew, ...extra });
}

router.get("/services/new", wrap(async (req, res) => serviceForm(res, { ...blankService }, { isNew: true })));

router.get("/services/:id", wrap(async (req, res, next) => {
  const r = (await query("SELECT * FROM services WHERE id = ?", [req.params.id]))[0];
  if (!r) return next();
  await serviceForm(res, { ...r, perks: parseJson(r.perks), hub: parseJson(r.hub) }, { saved: req.query.saved === "1" });
}));

async function saveService(req, res, next) {
  const isNew = !req.params.id;
  const b = req.body;
  const errors = req.uploadError ? [req.uploadError] : [];
  const cats = (await query("SELECT id FROM categories")).map((c) => c.id);
  const service = {
    id: req.params.id || "",
    cat: str(b.cat, 60), name: str(b.name, 190), short: str(b.short, 500), why: str(b.why, 4000),
    perks: String(b.perks || "").split(/\r?\n/).map((p) => p.trim().slice(0, 200)).filter(Boolean).slice(0, 20),
    hub: rows(b, ["title", "text"]).map((r) => ({ title: r.title.slice(0, 150), text: r.text.slice(0, 600) })).slice(0, 10),
    sort_order: int(b.sort_order, 0, 9999), featured_order: int(b.featured_order, 0, 9), published: flag(b.published), img: str(b.img, 190),
  };
  if (!service.name) errors.push("Name is required.");
  if (!cats.includes(service.cat)) errors.push("Choose a category.");
  if (!service.short) errors.push("Short description is required.");
  if (!service.why) errors.push("Description is required.");
  const img = await resolveImage(req, errors);
  if (errors.length) return serviceForm(res, service, { error: errors.join(" "), isNew });
  service.img = img;
  if (isNew) {
    const base = slugify(service.name) || "service";
    let id = base;
    for (let n = 2; (await query("SELECT id FROM services WHERE id = ?", [id]))[0]; n++) id = `${base}-${n}`;
    service.id = id;
    await query("INSERT INTO services (id,cat,name,img,short,why,perks,hub,sort_order,featured_order,published) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, service.cat, service.name, img, service.short, service.why, JSON.stringify(service.perks), JSON.stringify(service.hub), service.sort_order, service.featured_order, service.published]);
  } else {
    const r = await query("UPDATE services SET cat=?,name=?,img=?,short=?,why=?,perks=?,hub=?,sort_order=?,featured_order=?,published=? WHERE id=?",
      [service.cat, service.name, img, service.short, service.why, JSON.stringify(service.perks), JSON.stringify(service.hub), service.sort_order, service.featured_order, service.published, service.id]);
    if (!r.affectedRows) return next();
  }
  res.redirect(`/admin/services/${service.id}?saved=1`);
}
router.post("/services", wrap(saveService));
router.post("/services/:id", wrap(saveService));
router.post("/services/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM services WHERE id = ?", [req.params.id]);
  res.redirect("/admin/services?saved=1");
}));

// =============================== posts
router.get("/posts", wrap(async (req, res) => {
  const posts = await query("SELECT id, title, published_at, published FROM posts ORDER BY published_at DESC, id DESC");
  res.render("admin/posts", { nav: "posts", posts, saved: req.query.saved === "1" });
}));

const today = () => new Date().toISOString().slice(0, 10);
async function postForm(res, post, extra = {}) {
  res.status(extra.error ? 400 : 200).render("admin/post-form", { nav: "posts", post, images: await imageOptions(), isNew: !post.id, ...extra });
}

router.get("/posts/new", wrap(async (req, res) =>
  postForm(res, { id: 0, title: "", img: "", cta: "Read More", short: "", sections: [], published_at: today(), published: 1 })));

router.get("/posts/:id", wrap(async (req, res, next) => {
  const r = (await query("SELECT * FROM posts WHERE id = ?", [Number(req.params.id) || 0]))[0];
  if (!r) return next();
  await postForm(res, { ...r, sections: parseJson(r.sections), published_at: String(r.published_at).slice(0, 10) }, { saved: req.query.saved === "1" });
}));

async function savePost(req, res, next) {
  const id = Number(req.params.id) || 0;
  const b = req.body;
  const errors = req.uploadError ? [req.uploadError] : [];
  const post = {
    id, title: str(b.title, 255), short: str(b.short, 500), cta: str(b.cta, 80) || "Read More", img: str(b.img, 190),
    sections: rows(b, ["heading", "text"]).map((r) => ({ heading: r.heading.slice(0, 200), text: r.text })),
    published_at: str(b.published_at, 10), published: flag(b.published),
  };
  if (!post.title) errors.push("Title is required.");
  if (!post.short) errors.push("Summary is required.");
  if (!DATE.test(post.published_at) || Number.isNaN(Date.parse(post.published_at))) errors.push("Enter a valid date.");
  if (!post.sections.length) errors.push("Add at least one section.");
  const img = await resolveImage(req, errors);
  if (errors.length) return postForm(res, post, { error: errors.join(" ") });
  const vals = [post.title, img, post.cta, post.short, JSON.stringify(post.sections), post.published_at, post.published];
  let newId = id;
  if (!id) newId = (await query("INSERT INTO posts (title,img,cta,short,sections,published_at,published) VALUES (?,?,?,?,?,?,?)", vals)).insertId;
  else if (!(await query("UPDATE posts SET title=?,img=?,cta=?,short=?,sections=?,published_at=?,published=? WHERE id=?", [...vals, id])).affectedRows) return next();
  res.redirect(`/admin/posts/${newId}?saved=1`);
}
router.post("/posts", wrap(savePost));
router.post("/posts/:id", wrap(savePost));
router.post("/posts/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM posts WHERE id = ?", [Number(req.params.id) || 0]);
  res.redirect("/admin/posts?saved=1");
}));

// =============================== reviews
router.get("/reviews", wrap(async (req, res) => {
  const reviews = await query("SELECT id, title, name, role, sort_order, published FROM reviews ORDER BY sort_order, id");
  res.render("admin/reviews", { nav: "reviews", reviews, saved: req.query.saved === "1" });
}));

const reviewForm = (res, review, extra = {}) => res.status(extra.error ? 400 : 200).render("admin/review-form", { nav: "reviews", review, isNew: !review.id, ...extra });

router.get("/reviews/new", (req, res) => reviewForm(res, { id: 0, title: "", body: "", name: "", role: "", sort_order: 0, published: 1 }));

router.get("/reviews/:id", wrap(async (req, res, next) => {
  const r = (await query("SELECT * FROM reviews WHERE id = ?", [Number(req.params.id) || 0]))[0];
  if (!r) return next();
  reviewForm(res, r, { saved: req.query.saved === "1" });
}));

async function saveReview(req, res, next) {
  const id = Number(req.params.id) || 0;
  const b = req.body;
  const review = { id, title: str(b.title, 190), body: str(b.body, 2000), name: str(b.name, 150), role: str(b.role, 150), sort_order: int(b.sort_order, 0, 9999), published: flag(b.published) };
  const missing = ["title", "body", "name", "role"].filter((k) => !review[k]);
  if (missing.length) return reviewForm(res, review, { error: `Required: ${missing.join(", ")}.` });
  const vals = [review.title, review.body, review.name, review.role, review.sort_order, review.published];
  let newId = id;
  if (!id) newId = (await query("INSERT INTO reviews (title,body,name,role,sort_order,published) VALUES (?,?,?,?,?,?)", vals)).insertId;
  else if (!(await query("UPDATE reviews SET title=?,body=?,name=?,role=?,sort_order=?,published=? WHERE id=?", [...vals, id])).affectedRows) return next();
  res.redirect(`/admin/reviews/${newId}?saved=1`);
}
router.post("/reviews", wrap(saveReview));
router.post("/reviews/:id", wrap(saveReview));
router.post("/reviews/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM reviews WHERE id = ?", [Number(req.params.id) || 0]);
  res.redirect("/admin/reviews?saved=1");
}));

// =============================== team members
const peopleList = () => query("SELECT id, name, role, sort_order, published FROM people ORDER BY sort_order, id");

router.get("/people", wrap(async (req, res) => {
  res.render("admin/people", { nav: "people", people: await peopleList(), saved: req.query.saved === "1" });
}));

const blankPerson = { id: 0, name: "", role: "", headline: "", bio: "", img: "", highlights: [], badge_img: "", sort_order: 0, published: 1 };
async function personForm(res, person, extra = {}) {
  res.status(extra.error ? 400 : 200).render("admin/person-form", { nav: "people", person, images: await imageOptions(), isNew: !person.id, ...extra });
}

router.get("/people/new", wrap(async (req, res) => personForm(res, { ...blankPerson })));

router.get("/people/:id", wrap(async (req, res, next) => {
  const person = (await query("SELECT * FROM people WHERE id = ?", [Number(req.params.id) || 0]))[0];
  if (!person) return next();
  await personForm(res, { ...person, highlights: parseJson(person.highlights) }, { saved: req.query.saved === "1" });
}));

async function savePerson(req, res, next) {
  const id = Number(req.params.id) || 0;
  if (id && !(await query("SELECT id FROM people WHERE id = ?", [id]))[0]) return next();
  const b = req.body;
  const errors = req.uploadError ? [req.uploadError] : [];
  const person = {
    ...blankPerson, id, name: str(b.name, 150), role: str(b.role, 150), headline: str(b.headline, 190),
    bio: str(b.bio, 4000), img: str(b.img, 190),
    highlights: String(b.highlights || "").split(/\r?\n/).map((v) => v.trim().slice(0, 150)).filter(Boolean).slice(0, 20),
    badge_img: str(b.badge_img, 190), sort_order: int(b.sort_order, 0, 9999), published: flag(b.published),
  };
  const missing = ["name", "role", "headline", "bio"].filter((key) => !person[key]);
  if (missing.length) errors.push(`Required: ${missing.join(", ")}.`);
  if (person.badge_img && !/^(uploads\/)?[\w.\-]+\.(jpe?g|png|webp)$/i.test(person.badge_img))
    errors.push("Choose a valid badge image.");
  const img = await resolveImage(req, errors);
  if (errors.length) return personForm(res, person, { error: errors.join(" "), isNew: !id });
  person.img = img;
  const values = [person.name, person.role, person.headline, person.bio, person.img, JSON.stringify(person.highlights), person.badge_img, person.sort_order, person.published];
  let personId = id;
  if (!id) personId = (await query("INSERT INTO people (name,role,headline,bio,img,highlights,badge_img,sort_order,published) VALUES (?,?,?,?,?,?,?,?,?)", values)).insertId;
  else await query("UPDATE people SET name=?,role=?,headline=?,bio=?,img=?,highlights=?,badge_img=?,sort_order=?,published=? WHERE id=?", [...values, id]);
  res.redirect(`/admin/people/${personId}?saved=1`);
}
router.post("/people", wrap(savePerson));
router.post("/people/:id", wrap(savePerson));
router.post("/people/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM people WHERE id = ?", [Number(req.params.id) || 0]);
  res.redirect("/admin/people?saved=1");
}));

// =============================== products
async function renderProducts(res, extra = {}) {
  const [products, categories] = await Promise.all([
    query(
      `SELECT p.id, p.slug, p.title, p.image, p.sort_order, p.published, c.name AS category_name
       FROM products p JOIN product_categories c ON c.id = p.category_id
       ORDER BY c.sort_order, p.sort_order, p.title`
    ),
    query(
      `SELECT c.id, c.name, c.slug, c.sort_order, COUNT(p.id) AS product_count
       FROM product_categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id, c.name, c.slug, c.sort_order ORDER BY c.sort_order, c.name`
    ),
  ]);
  res.status(extra.error ? 400 : 200).render("admin/products", {
    nav: "products",
    products,
    categories,
    saved: false,
    ...extra,
  });
}

router.get("/products", wrap(async (req, res) => renderProducts(res, { saved: req.query.saved === "1" })));

router.post("/product-categories", wrap(async (req, res) => {
  const name = str(req.body.name, 150);
  const sortOrder = int(req.body.sort_order, 0, 9999);
  if (!name) return renderProducts(res, { error: "Category name is required." });
  const base = slugify(name) || "category";
  let slug = base;
  for (let suffix = 2; (await query("SELECT id FROM product_categories WHERE slug = ?", [slug]))[0]; suffix++) {
    slug = `${base}-${suffix}`;
  }
  await query("INSERT INTO product_categories (slug,name,sort_order) VALUES (?,?,?)", [slug, name, sortOrder]);
  res.redirect("/admin/products?saved=1");
}));

router.post("/product-categories/:id", wrap(async (req, res, next) => {
  const id = int(req.params.id, 1, 100000000);
  const name = str(req.body.name, 150);
  if (!name) return renderProducts(res, { error: "Category name is required." });
  if (!(await query("SELECT id FROM product_categories WHERE id = ?", [id]))[0]) return next();
  await query("UPDATE product_categories SET name = ?, sort_order = ? WHERE id = ?", [
    name,
    int(req.body.sort_order, 0, 9999),
    id,
  ]);
  res.redirect("/admin/products?saved=1");
}));

router.post("/product-categories/:id/delete", wrap(async (req, res, next) => {
  const id = int(req.params.id, 1, 100000000);
  const category = (await query("SELECT id FROM product_categories WHERE id = ?", [id]))[0];
  if (!category) return next();
  const [{ n }] = await query("SELECT COUNT(*) n FROM products WHERE category_id = ?", [id]);
  if (n) return renderProducts(res, { error: "Move or delete this category's products before deleting the category." });
  await query("DELETE FROM product_categories WHERE id = ?", [id]);
  res.redirect("/admin/products?saved=1");
}));

const blankProduct = {
  id: 0,
  slug: "",
  category_id: "",
  title: "",
  image: "",
  tags: "",
  description: "",
  details: "",
  sort_order: 0,
  published: 1,
};

async function productForm(res, product, extra = {}) {
  product.description = sanitizeProductHtml(product.description);
  product.details = sanitizeProductHtml(product.details);
  const [categories, images] = await Promise.all([
    query("SELECT id, name FROM product_categories ORDER BY sort_order, name"),
    imageOptions(),
  ]);
  res.status(extra.error ? 400 : 200).render("admin/product-form", {
    nav: "products",
    product,
    categories,
    images,
    isNew: !product.id,
    ...extra,
  });
}

router.get("/products/new", wrap(async (req, res) => productForm(res, { ...blankProduct })));

router.get("/products/:id", wrap(async (req, res, next) => {
  const id = int(req.params.id, 1, 100000000);
  const product = (await query(
    `SELECT p.*, (SELECT GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR ',') FROM product_tags t WHERE t.product_id = p.id) AS tags
     FROM products p WHERE p.id = ?`,
    [id]
  ))[0];
  if (!product) return next();
  await productForm(res, product, { saved: req.query.saved === "1" });
}));

async function saveProduct(req, res, next) {
  const id = int(req.params.id, 0, 100000000);
  const existing = id ? (await query("SELECT id, slug FROM products WHERE id = ?", [id]))[0] : null;
  if (id && !existing) return next();
  const body = req.body;
  const errors = req.uploadError ? [req.uploadError] : [];
  const product = {
    ...blankProduct,
    id,
    slug: existing ? existing.slug : "",
    title: str(body.title, 255),
    category_id: int(body.category_id, 1, 100000000),
    image: str(body.img, 190),
    tags: normalizeProductTags(body.tags).join(", "),
    description: sanitizeProductHtml(body.description),
    details: sanitizeProductHtml(body.details),
    sort_order: int(body.sort_order, 0, 9999),
    published: flag(body.published),
  };

  if (!product.title) errors.push("Product title is required.");
  if (!(await query("SELECT id FROM product_categories WHERE id = ?", [product.category_id]))[0]) errors.push("Choose a product category.");
  if (!product.description) errors.push("Product description is required.");
  if (!product.details) errors.push("Product details are required.");
  const image = await resolveImage(req, errors);
  if (errors.length) return productForm(res, product, { error: errors.join(" "), isNew: !id });
  product.image = image;

  if (!existing) {
    const base = slugify(product.title) || "product";
    product.slug = base;
    for (let suffix = 2; (await query("SELECT id FROM products WHERE slug = ?", [product.slug]))[0]; suffix++) {
      product.slug = `${base}-${suffix}`;
    }
  }

  const productId = await withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      let currentId = id;
      if (existing) {
        await conn.execute(
          "UPDATE products SET category_id=?,title=?,image=?,description=?,details=?,sort_order=?,published=? WHERE id=?",
          [product.category_id, product.title, product.image, product.description, product.details, product.sort_order, product.published, id]
        );
      } else {
        const [result] = await conn.execute(
          "INSERT INTO products (slug,category_id,title,image,description,details,sort_order,published) VALUES (?,?,?,?,?,?,?,?)",
          [product.slug, product.category_id, product.title, product.image, product.description, product.details, product.sort_order, product.published]
        );
        currentId = result.insertId;
      }
      await conn.execute("DELETE FROM product_tags WHERE product_id = ?", [currentId]);
      for (const tag of normalizeProductTags(body.tags)) {
        await conn.execute("INSERT INTO product_tags (product_id,tag) VALUES (?,?)", [currentId, tag]);
      }
      await conn.commit();
      return currentId;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
  res.redirect(`/admin/products/${productId}?saved=1`);
}

router.post("/products", wrap(saveProduct));
router.post("/products/:id", wrap(saveProduct));
router.post("/products/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM products WHERE id = ?", [int(req.params.id, 1, 100000000)]);
  res.redirect("/admin/products?saved=1");
}));

// =============================== quote requests
const STATUSES = ["new", "contacted", "quoted", "won", "lost"];

router.get("/quotes", wrap(async (req, res) => {
  const filter = STATUSES.includes(req.query.status) ? req.query.status : "";
  const [quotes, groups] = await Promise.all([
    filter
      ? query("SELECT id, name, email, phone, service, status, created_at FROM quote_requests WHERE status = ? ORDER BY created_at DESC LIMIT 500", [filter])
      : query("SELECT id, name, email, phone, service, status, created_at FROM quote_requests ORDER BY created_at DESC LIMIT 500"),
    query("SELECT status, COUNT(*) n FROM quote_requests GROUP BY status"),
  ]);
  const counts = Object.fromEntries(groups.map((g) => [g.status, g.n]));
  res.render("admin/quotes", { nav: "quotes", quotes, filter, counts });
}));

router.get("/quotes/:id", wrap(async (req, res, next) => {
  const quote = (await query("SELECT * FROM quote_requests WHERE id = ?", [Number(req.params.id) || 0]))[0];
  if (!quote) return next();
  const attachments = await query("SELECT id, OCTET_LENGTH(data) AS bytes FROM quote_attachments WHERE quote_id = ? ORDER BY id", [quote.id]);
  res.render("admin/quote-detail", { nav: "quotes", quote, attachments, saved: req.query.saved === "1" });
}));

router.get("/quotes/:id/attachments/:attachmentId", wrap(async (req, res, next) => {
  const attachment = (await query(
    "SELECT mime, data FROM quote_attachments WHERE id = ? AND quote_id = ?",
    [Number(req.params.attachmentId) || 0, Number(req.params.id) || 0]
  ))[0];
  if (!attachment) return next();
  res.set({
    "Content-Type": attachment.mime,
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(attachment.data);
}));

router.post("/quotes/:id", wrap(async (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : "new";
  await query("UPDATE quote_requests SET status = ?, notes = ? WHERE id = ?", [status, str(req.body.notes, 4000), Number(req.params.id) || 0]);
  res.redirect(`/admin/quotes/${Number(req.params.id) || 0}?saved=1`);
}));

router.post("/quotes/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM quote_requests WHERE id = ?", [Number(req.params.id) || 0]);
  res.redirect("/admin/quotes");
}));

router.get("/product-quotes", wrap(async (req, res) => {
  const filter = STATUSES.includes(req.query.status) ? req.query.status : "";
  const [quotes, groups] = await Promise.all([
    query(
      `SELECT q.id, q.name, q.email, q.phone, q.status, q.created_at,
              (SELECT COUNT(*) FROM product_quote_items i WHERE i.quote_id = q.id) AS item_count
       FROM product_quotes q ${filter ? "WHERE q.status = ?" : ""}
       ORDER BY q.created_at DESC LIMIT 500`,
      filter ? [filter] : []
    ),
    query("SELECT status, COUNT(*) n FROM product_quotes GROUP BY status"),
  ]);
  res.render("admin/product-quotes", {
    nav: "product-quotes",
    quotes,
    filter,
    counts: Object.fromEntries(groups.map((group) => [group.status, group.n])),
  });
}));

router.get("/product-quotes/:id", wrap(async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  const quote = (await query("SELECT * FROM product_quotes WHERE id = ?", [id]))[0];
  if (!quote) return next();
  const items = await query(
    "SELECT product_id, product_title, product_slug, product_image, quantity FROM product_quote_items WHERE quote_id = ? ORDER BY id",
    [id]
  );
  res.render("admin/product-quote-detail", { nav: "product-quotes", quote, items, saved: req.query.saved === "1" });
}));

router.post("/product-quotes/:id", wrap(async (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : "new";
  const id = Number(req.params.id) || 0;
  await query("UPDATE product_quotes SET status = ?, notes = ? WHERE id = ?", [status, str(req.body.notes, 4000), id]);
  res.redirect(`/admin/product-quotes/${id}?saved=1`);
}));

router.post("/product-quotes/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM product_quotes WHERE id = ?", [Number(req.params.id) || 0]);
  res.redirect("/admin/product-quotes");
}));
router.parseMultipart = parseMultipart;
module.exports = router;

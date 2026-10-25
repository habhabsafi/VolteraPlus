const express = require("express");
const { query, withConnection } = require("./db");
const store = require("./store");
const { sendQuoteEmails } = require("./mailer");
const { sanitizeProductHtml } = require("./product-content");
const { verifyTurnstile } = require("./turnstile");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const str = (value, max) => String(value ?? "").trim().slice(0, max);
const hits = new Map();
const HOUR = 60 * 60 * 1000;
const PAGE_SIZE = 12;

function parseItems(raw) {
  if (typeof raw !== "string" || raw.length > 8000) return { error: "Please review the products in your quote cart." };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Please review the products in your quote cart." };
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) {
    return { error: "Choose between 1 and 50 products for a quote." };
  }
  const slugs = new Set();
  const items = [];
  for (const item of parsed) {
    const slug = str(item && item.slug, 190);
    const quantity = Number(item && item.quantity);
    if (!SLUG.test(slug) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { error: "Each product must have a valid quantity between 1 and 99." };
    }
    if (slugs.has(slug)) return { error: "Remove duplicate products from your quote cart." };
    slugs.add(slug);
    items.push({ slug, quantity });
  }
  return { items };
}

function limited(ip) {
  const now = Date.now();
  const active = (hits.get(ip) || []).filter((time) => now - time < HOUR);
  if (active.length >= 5) {
    hits.set(ip, active);
    return true;
  }
  active.push(now);
  hits.set(ip, active);
  return false;
}

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function createRouter({
  productStore = store,
  dbQuery = query,
  dbWithConnection = withConnection,
  sendEmails = sendQuoteEmails,
  verify = verifyTurnstile,
} = {}) {
  const router = express.Router();

  router.get("/products", wrap(async (req, res) => {
    const categories = await productStore.getProductCategories();
    const category = str(req.query.category, 100);
    const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const firstPage = await productStore.getProducts({ category, limit: PAGE_SIZE, offset: 0 });
    const pages = Math.max(1, Math.ceil(firstPage.total / PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const result = page === 1
      ? firstPage
      : await productStore.getProducts({ category, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    res.render("products", {
      page: "products",
      title: "Products | Voltera Plus",
      description: "Browse Voltera Plus products and request a quote for the items you need.",
      products: result.products,
      categories,
      selectedCategory: category,
      currentPage: page,
      totalPages: pages,
      resultCount: result.total,
      pageUrl: (number) => `/products?${category ? `category=${encodeURIComponent(category)}&` : ""}page=${number}`,
    });
  }));

  router.get("/products/:slug", wrap(async (req, res, next) => {
    const product = await productStore.getProduct(str(req.params.slug, 190));
    if (!product) return next();
    const related = await productStore.getRelatedProducts(product.id, 4);
    product.description = sanitizeProductHtml(product.description);
    product.details = sanitizeProductHtml(product.details);
    res.render("product-detail", {
      page: "products",
      title: `${product.title} | Products | Voltera Plus`,
      description: product.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 300),
      product,
      related,
    });
  }));

  router.get("/cart", (req, res) => {
    res.render("product-cart", {
      page: "cart",
      title: "Quote Cart | Voltera Plus",
      description: "Review products and quantities before requesting a quote.",
    });
  });

  router.get("/product-quote", wrap(async (req, res, next) => {
    const directSlug = str(req.query.product, 190);
    const directProduct = directSlug ? await productStore.getProduct(directSlug) : null;
    if (directSlug && !directProduct) return next();
    const directQuantity = Math.max(1, Math.min(99, Number.parseInt(req.query.quantity, 10) || 1));
    res.render("product-quote", {
      page: "checkout",
      title: "Request a Product Quote | Voltera Plus",
      description: "Send your selected products to Voltera Plus for a quote.",
      directProduct,
      directQuantity,
      error: null,
      sent: req.query.sent === "1",
      values: {},
    });
  }));

  router.post("/product-quote", express.urlencoded({ extended: false, limit: "20kb" }), wrap(async (req, res, next) => {
    const body = req.body || {};
    const email = str(body.email, 190);
    const values = {
      name: str(body.name, 150),
      email,
      phone: str(body.phone, 40),
      message: str(body.message, 4000),
    };
    const directSlug = str(req.query.product, 190);
    const directProduct = directSlug ? await productStore.getProduct(directSlug) : null;
    const directQuantity = Math.max(1, Math.min(99, Number.parseInt(req.query.quantity, 10) || 1));
    const renderError = (message, status = 400) => res.status(status).render("product-quote", {
      page: "checkout",
      title: "Request a Product Quote | Voltera Plus",
      description: "Send your selected products to Voltera Plus for a quote.",
      directProduct,
      directQuantity,
      error: message,
      sent: false,
      values,
    });

    if (str(body.website, 200)) {
      return res.redirect(`/product-quote?sent=1${directSlug ? `&product=${encodeURIComponent(directSlug)}&quantity=${directQuantity}` : ""}`);
    }
    if (limited(req.ip)) return renderError("Too many requests. Please try again later or contact us by phone.", 429);
    if (!values.name || !EMAIL.test(values.email)) return renderError("Enter your name and a valid email address.");

    const parsed = parseItems(body.items);
    if (parsed.error) return renderError(parsed.error);

    const products = await productStore.getProductsBySlugs(parsed.items.map((item) => item.slug));
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    if (bySlug.size !== parsed.items.length) {
      return renderError("One or more selected products are no longer available. Please update your quote cart.");
    }
    const verification = await verify(req, str(body["cf-turnstile-response"], 2048), "product-quote");
    if (!verification.valid) {
      return renderError(
        verification.unavailable
          ? "Verification is temporarily unavailable. Please try again or call us."
          : "Please complete the security check and try again.",
        verification.unavailable ? 503 : 403
      );
    }
    const items = parsed.items.map((item) => ({ ...bySlug.get(item.slug), quantity: item.quantity }));

    const quoteId = await dbWithConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [result] = await conn.execute(
          "INSERT INTO product_quotes (name,email,phone,message,notes) VALUES (?,?,?,?, '')",
          [values.name, values.email, values.phone, values.message]
        );
        for (const item of items) {
          await conn.execute(
            "INSERT INTO product_quote_items (quote_id,product_id,product_title,product_slug,product_image,quantity) VALUES (?,?,?,?,?,?)",
            [result.insertId, item.id, item.title, item.slug, item.image, item.quantity]
          );
        }
        await conn.commit();
        return result.insertId;
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });

    const itemSummary = items.map((item) => `${item.title} x ${item.quantity}`).join("\n");
    const emailResult = await sendEmails({
      name: values.name,
      email: values.email,
      phone: values.phone,
      service: "Product quote",
      source: "products",
      photosCount: 0,
      message: `Requested products:\n${itemSummary}${values.message ? `\n\nAdditional details:\n${values.message}` : ""}`,
    }, await productStore.getSite());
    await dbQuery(
      "UPDATE product_quotes SET email_sent = ?, email_error = ? WHERE id = ?",
      [emailResult.sent ? 1 : 0, emailResult.error || "", quoteId]
    );
    res.redirect(`/product-quote?sent=1${directSlug ? `&product=${encodeURIComponent(directSlug)}&quantity=${directQuantity}` : ""}`);
  }));

  return router;
}

module.exports = { createRouter, parseItems };

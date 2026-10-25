const { query, parseJson } = require("./db");

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtDate = (d) => { const [y, m, day] = String(d).slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };

const toService = (r) => ({ id: r.id, cat: r.cat, name: r.name, img: r.img, short: r.short, why: r.why, perks: parseJson(r.perks), hub: parseJson(r.hub) });
const toPost = (r) => ({ id: r.id, title: r.title, img: r.img, cta: r.cta, short: r.short, sections: parseJson(r.sections), date: fmtDate(r.published_at) });
const toProduct = (r) => ({ ...r, tags: r.tags ? String(r.tags).split("|") : [] });

const SERVICE_ORDER = "ORDER BY sort_order, name";
const lim = (n) => (n ? ` LIMIT ${Number(n) | 0}` : "");
const PRODUCT_COLUMNS = `p.id, p.slug, p.title, p.image, p.description, p.details, p.sort_order,
  c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
  (SELECT GROUP_CONCAT(t.tag ORDER BY t.tag SEPARATOR '|') FROM product_tags t WHERE t.product_id = p.id) AS tags`;

module.exports = {
  getSite: async () => (await query("SELECT * FROM site_settings WHERE id = 1"))[0],
  getCategories: async () => query("SELECT id, name FROM categories ORDER BY sort_order"),
  getServices: async () => (await query(`SELECT * FROM services WHERE published = 1 ${SERVICE_ORDER}`)).map(toService),
  getServicesByCategory: async (cat) => (await query(`SELECT * FROM services WHERE published = 1 AND cat = ? ${SERVICE_ORDER}`, [cat])).map(toService),
  getFeaturedServices: async (cat) =>
    (await query("SELECT * FROM services WHERE published = 1 AND cat = ? AND featured_order > 0 ORDER BY featured_order", [cat])).map(toService),
  getService: async (id) => {
    const r = (await query("SELECT * FROM services WHERE published = 1 AND id = ?", [id]))[0];
    return r ? toService(r) : null;
  },
  // Next published service in order, wrapping around; used for the side image.
  getNextService: async (id) => {
    const all = await module.exports.getServices();
    const i = all.findIndex((s) => s.id === id);
    return all[(i + 1) % all.length];
  },
  getReviews: async (limit) => query(`SELECT title, body, name, role FROM reviews WHERE published = 1 ORDER BY sort_order, id${lim(limit)}`),
  getPeople: async () => (await query("SELECT id, name, role, headline, bio, img, highlights, badge_img FROM people WHERE published = 1 ORDER BY sort_order, id"))
    .map((person) => ({ ...person, highlights: parseJson(person.highlights) })),
  getPosts: async (limit) => (await query(`SELECT * FROM posts WHERE published = 1 ORDER BY published_at DESC, id DESC${lim(limit)}`)).map(toPost),
  getPost: async (id) => {
    const r = (await query("SELECT * FROM posts WHERE published = 1 AND id = ?", [Number(id) || 0]))[0];
    return r ? toPost(r) : null;
  },
  getRelatedPosts: async (id, limit = 3) =>
    (await query(`SELECT * FROM posts WHERE published = 1 AND id <> ? ORDER BY published_at DESC, id DESC${lim(limit)}`, [Number(id) || 0])).map(toPost),
  getProductCategories: async () => query(
    `SELECT c.id, c.slug, c.name, c.sort_order, COUNT(p.id) AS product_count
     FROM product_categories c
     JOIN products p ON p.category_id = c.id AND p.published = 1
     GROUP BY c.id, c.slug, c.name, c.sort_order
     ORDER BY c.sort_order, c.name`
  ),
  getProducts: async ({ category = "", limit = 12, offset = 0 } = {}) => {
    const where = category ? "WHERE p.published = 1 AND c.slug = ?" : "WHERE p.published = 1";
    const params = category ? [category] : [];
    const pageLimit = Math.min(48, Math.max(1, Number(limit) | 0));
    const pageOffset = Math.max(0, Number(offset) | 0);
    const [products, totalRows] = await Promise.all([
      query(
        `SELECT ${PRODUCT_COLUMNS} FROM products p JOIN product_categories c ON c.id = p.category_id
         ${where} ORDER BY p.sort_order, p.title LIMIT ${pageLimit} OFFSET ${pageOffset}`,
        params
      ),
      query(
        `SELECT COUNT(*) AS total FROM products p JOIN product_categories c ON c.id = p.category_id ${where}`,
        params
      ),
    ]);
    return { products: products.map(toProduct), total: Number(totalRows[0]?.total || 0) };
  },
  getProduct: async (slug) => {
    const row = (await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products p JOIN product_categories c ON c.id = p.category_id
       WHERE p.published = 1 AND p.slug = ?`,
      [slug]
    ))[0];
    return row ? toProduct(row) : null;
  },
  getProductSlugs: async () => query("SELECT slug FROM products WHERE published = 1 ORDER BY id").then((rows) => rows.map((row) => row.slug)),
  getProductsBySlugs: async (slugs) => {
    if (!slugs.length) return [];
    const placeholders = slugs.map(() => "?").join(",");
    return (await query(
      `SELECT p.id, p.slug, p.title, p.image, c.name AS category_name
       FROM products p JOIN product_categories c ON c.id = p.category_id
       WHERE p.published = 1 AND p.slug IN (${placeholders})`,
      slugs
    ));
  },
  getRelatedProducts: async (id, limit = 4) => {
    const count = Math.min(12, Math.max(1, Number(limit) | 0));
    return (await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products p JOIN product_categories c ON c.id = p.category_id
       WHERE p.published = 1 AND p.id <> ? AND EXISTS (
         SELECT 1 FROM product_tags current_tag
         JOIN product_tags related_tag ON related_tag.tag = current_tag.tag
         WHERE current_tag.product_id = ? AND related_tag.product_id = p.id
       )
       ORDER BY RAND() LIMIT ${count}`,
      [Number(id) || 0, Number(id) || 0]
    )).map(toProduct);
  },
};

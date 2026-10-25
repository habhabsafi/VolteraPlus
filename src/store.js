const { query, parseJson } = require("./db");

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtDate = (d) => { const [y, m, day] = String(d).slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };

const toService = (r) => ({ id: r.id, cat: r.cat, name: r.name, img: r.img, short: r.short, why: r.why, perks: parseJson(r.perks), hub: parseJson(r.hub) });
const toPost = (r) => ({ id: r.id, title: r.title, img: r.img, cta: r.cta, short: r.short, sections: parseJson(r.sections), date: fmtDate(r.published_at) });

const SERVICE_ORDER = "ORDER BY sort_order, name";
const lim = (n) => (n ? ` LIMIT ${Number(n) | 0}` : "");

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
};

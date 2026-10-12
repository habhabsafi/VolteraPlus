const site = require("./data/site.json");
const categories = require("./data/categories.json");
const services = require("./data/services.json");
const reviews = require("./data/reviews.json");
const posts = require("./data/posts.json");

const FEATURED = {
  electric: ["troubleshooting", "panel-upgrades", "lighting"],
  "general-contractor": ["renovations", "additions", "project-management"],
  handyman: ["home-repairs", "painting", "assembly-mounting"],
};

// Data access layer. Swap the bodies for database queries later; callers stay unchanged.
module.exports = {
  getSite: async () => site,
  getCategories: async () => categories,
  getServices: async () => services,
  getServicesByCategory: async (cat) => services.filter((s) => s.cat === cat),
  getFeaturedServices: async (cat) =>
    (FEATURED[cat] || []).map((id) => services.find((s) => s.id === id)).filter(Boolean),
  getService: async (id) => services.find((s) => s.id === id) || null,
  getNextService: async (id) => {
    const i = services.findIndex((s) => s.id === id);
    return services[(i + 1) % services.length];
  },
  getReviews: async (limit) => reviews.slice(0, limit),
  getPosts: async (limit) => posts.slice(0, limit),
  getPost: async (id) => posts.find((p) => p.id === Number(id)) || null,
  getRelatedPosts: async (id, limit = 3) => posts.filter((p) => p.id !== Number(id)).slice(0, limit),
};

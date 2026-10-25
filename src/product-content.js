const sanitizeHtml = require("sanitize-html");

function sanitizeProductHtml(value) {
  return sanitizeHtml(String(value ?? "").slice(0, 30000), {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "blockquote", "a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}

function normalizeProductTags(value) {
  return [...new Set(
    String(value || "").split(/[,\r\n]+/).map((tag) => tag.trim().replace(/[|<>]/g, "").slice(0, 80).toLowerCase()).filter(Boolean)
  )].slice(0, 20);
}

module.exports = { sanitizeProductHtml, normalizeProductTags };

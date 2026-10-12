const express = require("express");
const { query } = require("./db");
const { sendQuoteEmails } = require("./mailer");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max) => String(v ?? "").trim().slice(0, max);

// 5 submissions per hour per IP.
const hits = new Map();
const HOUR = 3600 * 1000;
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < HOUR);
  if (list.length >= 5) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  return false;
}

router.post("/", express.urlencoded({ extended: false, limit: "20kb" }), async (req, res, next) => {
  const wantsJson = (req.get("accept") || "").includes("application/json");
  const reply = (status, ok, message) =>
    wantsJson ? res.status(status).json({ ok, message }) : res.status(status).redirect(`/contact?${ok ? "sent=1" : "error=1"}`);
  try {
    const b = req.body;
    // Bots fill the hidden field; pretend success so they get no signal.
    if (str(b.website, 200)) return reply(200, true, "Thank you!");
    if (limited(req.ip)) return reply(429, false, "Too many requests. Please call us instead.");
    const q = { name: str(b.Name, 150), email: str(b.Email, 190), phone: str(b.Phone, 40), service: str(b.Service, 190), message: str(b.Message, 4000), source: str(b.source, 40) };
    if (!q.name || !EMAIL.test(q.email) || (!q.service && !q.message)) return reply(400, false, "Please enter your name, a valid email and a service.");
    const id = (await query(
      "INSERT INTO quote_requests (name,email,phone,service,message,source,notes) VALUES (?,?,?,?,?,?,'')",
      [q.name, q.email, q.phone, q.service, q.message, q.source]
    )).insertId;
    // The request is saved first; email problems must not lose it or fail the visitor.
    const sent = await sendQuoteEmails(q, res.locals.site);
    if (sent) await query("UPDATE quote_requests SET email_sent = 1 WHERE id = ?", [id]);
    reply(200, true, "Thank you! We received your request and will contact you shortly.");
  } catch (e) {
    next(e);
  }
});

module.exports = router;

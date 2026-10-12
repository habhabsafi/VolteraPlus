const express = require("express");
const { query } = require("../db");
const auth = require("./auth");
const content = require("./content");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.locals.nav = "";
  res.locals.error = null;
  res.locals.saved = false;
  next();
});
router.use(wrap(auth.loadAdmin));
router.use(content.parseMultipart);
router.use(auth.csrfGuard);

// --- login / logout
router.get("/login", (req, res) => (req.admin ? res.redirect("/admin") : res.render("admin/login", { email: "" })));

router.post("/login", wrap(async (req, res) => {
  const email = str(req.body.email, 190).toLowerCase();
  const key = `${req.ip}|${email}`;
  const fail = (msg, status = 401) => res.status(status).render("admin/login", { email, error: msg });
  if (auth.limiter.blocked(key)) return fail("Too many attempts. Try again in 15 minutes.", 429);
  const user = (await query("SELECT id, password_hash FROM admin_users WHERE email = ? AND active = 1", [email]))[0];
  // Verify against a dummy hash when the user is unknown to keep timing similar.
  const ok = user ? auth.verifyPassword(String(req.body.password || ""), user.password_hash) : (auth.verifyPassword("x", auth.hashPassword("y")), false);
  if (!ok) { auth.limiter.fail(key); return fail("Invalid email or password."); }
  auth.limiter.clear(key);
  await auth.startSession(req, res, user.id);
  res.redirect("/admin");
}));

router.post("/logout", wrap(async (req, res) => {
  await auth.endSession(req, res);
  res.redirect("/admin/login");
}));

// Everything below requires a signed-in admin
router.use(auth.requireAdmin);

router.get("/", wrap(async (req, res) => {
  const [[c]] = await Promise.all([
    query("SELECT (SELECT COUNT(*) FROM services) services, (SELECT COUNT(*) FROM posts) posts, (SELECT COUNT(*) FROM reviews) reviews, (SELECT COUNT(*) FROM admin_users) users, (SELECT COUNT(*) FROM quote_requests WHERE status = 'new') newQuotes"),
  ]);
  res.render("admin/dashboard", { nav: "dashboard", counts: c });
}));

router.use(content);

// --- contact / site settings
const FIELDS = [
  ["name", "Business name", 150], ["tagline", "Tagline", 255], ["owner", "Owner name", 150], ["title", "Owner title", 150],
  ["phone", "Phone", 40], ["email", "Email", 190], ["web", "Website", 190], ["area", "Service area", 255],
];

router.get("/settings", wrap(async (req, res) => {
  const row = (await query("SELECT * FROM site_settings WHERE id = 1"))[0];
  res.render("admin/settings", { nav: "settings", fields: FIELDS, values: row, saved: req.query.saved === "1", mail: req.query.mail || "" });
}));

router.post("/settings", wrap(async (req, res) => {
  const values = {};
  for (const [k, , max] of FIELDS) values[k] = str(req.body[k], max);
  const missing = FIELDS.filter(([k]) => !values[k]).map(([, l]) => l);
  let error = missing.length ? `Required: ${missing.join(", ")}` : !EMAIL.test(values.email) ? "Enter a valid email address." : null;
  if (error) return res.status(400).render("admin/settings", { nav: "settings", fields: FIELDS, values, error });
  await query(`UPDATE site_settings SET ${FIELDS.map(([k]) => `${k} = ?`).join(", ")} WHERE id = 1`, FIELDS.map(([k]) => values[k]));
  res.redirect("/admin/settings?saved=1");
}));

// --- email test
router.post("/settings/test-email", wrap(async (req, res) => {
  const site = (await query("SELECT email FROM site_settings WHERE id = 1"))[0];
  const to = process.env.MAIL_TO || site.email;
  try {
    await require("../mailer").sendTestEmail(to);
    res.redirect("/admin/settings?mail=ok");
  } catch (e) {
    res.redirect("/admin/settings?mail=" + encodeURIComponent(`${e.code || ""} ${e.message}`.trim().slice(0, 300)));
  }
}));

// --- own password
router.get("/account", (req, res) => res.render("admin/account", { nav: "account", saved: req.query.saved === "1" }));

router.post("/account", wrap(async (req, res) => {
  const { current, password, confirm } = req.body;
  const render = (error) => res.status(400).render("admin/account", { nav: "account", error });
  const user = (await query("SELECT password_hash FROM admin_users WHERE id = ?", [req.admin.id]))[0];
  if (!auth.verifyPassword(String(current || ""), user.password_hash)) return render("Current password is incorrect.");
  if (String(password || "").length < 10) return render("New password must be at least 10 characters.");
  if (password !== confirm) return render("Passwords do not match.");
  await query("UPDATE admin_users SET password_hash = ? WHERE id = ?", [auth.hashPassword(password), req.admin.id]);
  res.redirect("/admin/account?saved=1");
}));

// --- admin users (owner only)
router.use("/users", auth.requireOwner);

router.get("/users", wrap(async (req, res) => {
  const users = await query("SELECT id, email, role, active, last_login_at FROM admin_users ORDER BY email");
  res.render("admin/users", { nav: "users", users, saved: req.query.saved === "1" });
}));

router.post("/users", wrap(async (req, res) => {
  const email = str(req.body.email, 190).toLowerCase();
  const role = req.body.role === "owner" ? "owner" : "staff";
  const password = String(req.body.password || "");
  const list = () => query("SELECT id, email, role, active, last_login_at FROM admin_users ORDER BY email");
  const fail = async (error) => res.status(400).render("admin/users", { nav: "users", users: await list(), error });
  if (!EMAIL.test(email)) return fail("Enter a valid email address.");
  if (password.length < 10) return fail("Password must be at least 10 characters.");
  if ((await query("SELECT id FROM admin_users WHERE email = ?", [email]))[0]) return fail("That email already has an account.");
  await query("INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)", [email, auth.hashPassword(password), role]);
  res.redirect("/admin/users?saved=1");
}));

// Deactivating also ends their sessions. You cannot deactivate yourself.
router.post("/users/:id/toggle", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id !== req.admin.id) {
    await query("UPDATE admin_users SET active = 1 - active WHERE id = ?", [id]);
    await query("DELETE FROM admin_sessions WHERE user_id = ? AND (SELECT active FROM admin_users WHERE id = ?) = 0", [id, id]);
  }
  res.redirect("/admin/users?saved=1");
}));

router.post("/users/:id/password", wrap(async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length >= 10) {
    await query("UPDATE admin_users SET password_hash = ? WHERE id = ?", [auth.hashPassword(password), Number(req.params.id)]);
    await query("DELETE FROM admin_sessions WHERE user_id = ?", [Number(req.params.id)]);
  }
  res.redirect("/admin/users?saved=1");
}));

module.exports = router;


const crypto = require("crypto");
const { query } = require("../db");

const COOKIE = "vp_admin";
const SESSION_HOURS = 8;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const readCookie = (req, name) => {
  const m = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};

const cookieOptions = (req) => ({ httpOnly: true, sameSite: "lax", secure: req.secure, path: "/admin" });

async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await query("DELETE FROM admin_sessions WHERE expires_at < UTC_TIMESTAMP()");
  await query(
    `INSERT INTO admin_sessions (id, user_id, csrf, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${SESSION_HOURS} HOUR))`,
    [sha(token), userId, crypto.randomBytes(16).toString("hex")]
  );
  await query("UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_HOURS * 3600 * 1000 });
}

async function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await query("DELETE FROM admin_sessions WHERE id = ?", [sha(token)]);
  res.clearCookie(COOKIE, cookieOptions(req));
}

// Loads req.admin from the session cookie (if valid) and exposes the CSRF token to views.
async function loadAdmin(req, res, next) {
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const rows = await query(
        `SELECT u.id, u.email, u.role, s.csrf FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP() AND u.active = 1`,
        [sha(token)]
      );
      if (rows[0]) {
        req.admin = { id: rows[0].id, email: rows[0].email, role: rows[0].role };
        req.csrf = rows[0].csrf;
        res.locals.csrf = rows[0].csrf;
        res.locals.admin = req.admin;
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}

const requireAdmin = (req, res, next) => (req.admin ? next() : res.redirect("/admin/login"));
const requireOwner = (req, res, next) => (req.admin && req.admin.role === "owner" ? next() : res.status(403).render("admin/error", { message: "Owner access required." }));

// Rejects cross-site POSTs (Origin check) and, for signed-in users, requires the CSRF token.
function csrfGuard(req, res, next) {
  if (req.method !== "POST") return next();
  const origin = req.get("origin");
  if (origin && new URL(origin).host !== req.get("host")) return res.status(403).send("Forbidden");
  if (req.admin) {
    const given = Buffer.from(String((req.body && req.body._csrf) || ""));
    const want = Buffer.from(req.csrf);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(403).send("Invalid form token. Reload the page and try again.");
  }
  next();
}

// Creates the first owner from ADMIN_EMAIL / ADMIN_PASSWORD when no admin exists.
async function bootstrapOwner() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const [{ n }] = await query("SELECT COUNT(*) n FROM admin_users");
  if (n > 0) return;
  await query("INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, 'owner')", [email, hashPassword(password)]);
  console.log("Created owner account", email);
}

// Simple in-memory brute-force limiter: 8 failures per 15 minutes per IP+email.
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const limiter = {
  blocked(key) {
    const a = attempts.get(key);
    return !!a && Date.now() - a.first < WINDOW && a.count >= 8;
  },
  fail(key) {
    const a = attempts.get(key);
    if (!a || Date.now() - a.first >= WINDOW) attempts.set(key, { first: Date.now(), count: 1 });
    else a.count++;
  },
  clear: (key) => attempts.delete(key),
};

module.exports = { hashPassword, verifyPassword, startSession, endSession, loadAdmin, requireAdmin, requireOwner, csrfGuard, bootstrapOwner, limiter };

const express = require("express");
const multer = require("multer");
const { query, withConnection } = require("./db");
const { sendQuoteEmails } = require("./mailer");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3, fields: 12, fieldSize: 10 * 1024, parts: 16 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return cb(null, true);
    cb(new Error("Photos must be JPG, PNG or WebP files."));
  },
});

function parseImage(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

function parseQuoteBody(req, res, next) {
  const parser = req.is("multipart/form-data")
    ? upload.array("photos", 3)
    : express.urlencoded({ extended: false, limit: "20kb" });
  parser(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Each photo must be 2 MB or smaller."
      : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
        ? "Upload no more than 3 photos."
        : error.message || "Could not read the uploaded photos.";
    if ((req.get("accept") || "").includes("application/json")) return res.status(400).json({ ok: false, message });
    res.status(400).redirect("/contact?error=1");
  });
}

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

router.post("/", parseQuoteBody, async (req, res, next) => {
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
    const photos = (req.files || []).map((file) => ({ file, mime: parseImage(file.buffer) }));
    if (photos.some((photo) => !photo.mime)) return reply(400, false, "One or more files is not a valid JPG, PNG or WebP image.");
    q.photosCount = photos.length;
    const id = await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [result] = await conn.execute(
          "INSERT INTO quote_requests (name,email,phone,service,message,source,notes) VALUES (?,?,?,?,?,?,'')",
          [q.name, q.email, q.phone, q.service, q.message, q.source]
        );
        for (const { file, mime } of photos) {
          await conn.execute(
            "INSERT INTO quote_attachments (quote_id,mime,data) VALUES (?,?,?)",
            [result.insertId, mime, file.buffer]
          );
        }
        await conn.commit();
        return result.insertId;
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
    // The request is saved first; email problems must not lose it or fail the visitor.
    const { sent, error } = await sendQuoteEmails(q, res.locals.site);
    await query("UPDATE quote_requests SET email_sent = ?, email_error = ? WHERE id = ?", [sent ? 1 : 0, error, id]);
    reply(200, true, "Thank you! We received your request and will contact you shortly.");
  } catch (e) {
    next(e);
  }
});

module.exports = router;

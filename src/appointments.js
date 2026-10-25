const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { query, withConnection } = require("./db");
const store = require("./store");
const { verifyTurnstile } = require("./turnstile");
const { sendAppointmentEmails } = require("./mailer");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLOT_TIMES = ["08:00", "10:00", "12:00", "14:00", "16:00"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TIME_ZONE = "America/Toronto";
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

class AppointmentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3, fields: 16, fieldSize: 10 * 1024, parts: 20 },
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

function validDate(date) {
  if (!DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function localDateTimeTimestamp(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wallTime));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute)
  );
  return wallTime - (represented - wallTime);
}

function isFutureSlot(date, time) {
  return localDateTimeTimestamp(date, time) > Date.now();
}

function has24HoursNotice(date, time) {
  return localDateTimeTimestamp(date, time) - Date.now() >= 24 * 60 * 60 * 1000;
}

function validSlot(date, time, requireFuture = true) {
  return validDate(date) && SLOT_TIMES.includes(time) && (!requireFuture || isFutureSlot(date, time));
}

function currentOttawaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentOttawaMonth() {
  return currentOttawaDate().slice(0, 7);
}

function nextMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${String(date).slice(0, 10)}T00:00:00Z`));
}

function formatTime(time) {
  const [hour, minute] = String(time).slice(0, 5).split(":").map(Number);
  const suffix = hour < 12 ? "a.m." : "p.m.";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenKey() {
  const secret = process.env.APPOINTMENT_TOKEN_SECRET || "";
  if (!/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error("Set APPOINTMENT_TOKEN_SECRET to a 64-character hexadecimal key before enabling appointment bookings.");
  }
  return Buffer.from(secret, "hex");
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

function decryptToken(value) {
  const [iv, tag, encrypted] = String(value).split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function lockAppointmentCalendar(conn) {
  const [rows] = await conn.execute("SELECT id FROM site_settings WHERE id = 1 FOR UPDATE");
  if (!rows.length) throw new Error("The site settings row is missing; appointment writes cannot be serialized.");
}

async function appointmentByToken(token) {
  if (!TOKEN.test(token)) return null;
  return (await query("SELECT * FROM appointments WHERE access_token_hash = ?", [tokenHash(token)]))[0] || null;
}

async function sendNotice(id, event, res, notifyAdmin = false) {
  const appointment = (await query("SELECT * FROM appointments WHERE id = ?", [id]))[0];
  if (!appointment) throw new Error(`Appointment ${id} was not found while sending email.`);
  const result = await sendAppointmentEmails({
    appointment,
    site: res.locals.site,
    manageUrl: `${res.locals.baseUrl}/appointments/manage/${decryptToken(appointment.access_token_encrypted)}`,
    adminUrl: `${res.locals.baseUrl}/admin/appointments/${id}`,
    event,
    notifyAdmin,
  });
  await query("UPDATE appointments SET email_error = ? WHERE id = ?", [result.error || "", id]);
  return result;
}

function originGuard(req, res, next) {
  if (req.method !== "POST") return next();
  const site = req.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return res.status(403).send("Forbidden");
  const origin = req.get("origin");
  if (origin && origin !== "null") {
    let host = null;
    try { host = new URL(origin).host; } catch { /* Invalid origin is rejected below. */ }
    if (host !== req.get("host")) return res.status(403).send("Forbidden");
  }
  next();
}

router.use(express.urlencoded({ extended: false, limit: "30kb" }));
router.use(originGuard);

async function renderBooking(res, values = {}, error = null, status = 200) {
  const selectedDate = str(values.appointment_date, 10);
  res.status(status).render("book-appointment", {
    page: "book",
    title: "Book an Appointment | Voltera Plus",
    description: "Request a two-hour appointment with Voltera Plus in Ottawa.",
    allServices: await store.getServices(),
    initialMonth: validDate(selectedDate) && selectedDate.slice(0, 7) >= currentOttawaMonth()
      ? selectedDate.slice(0, 7)
      : currentOttawaMonth(),
    minMonth: currentOttawaMonth(),
    values,
    error,
  });
}

function parseBookingUpload(req, res, next) {
  upload.array("photos", 3)(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Each photo must be 2 MB or smaller."
      : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE"
        ? "Upload no more than 3 photos."
        : error.message || "Could not read the uploaded photos.";
    renderBooking(res, req.body || {}, message, 400).catch(next);
  });
}

// Five new requests per hour per IP.
const hits = new Map();
const HOUR = 60 * 60 * 1000;
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((time) => now - time < HOUR);
  if (list.length >= 5) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

async function availabilityForMonth(month) {
  const start = `${month}-01`;
  const end = nextMonth(month);
  const [reservations, blocks] = await Promise.all([
    query(
      "SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, TIME_FORMAT(start_time, '%H:%i') AS start_time FROM appointment_slot_reservations WHERE appointment_date >= ? AND appointment_date < ?",
      [start, end]
    ),
    query(
      "SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date FROM appointment_blocks WHERE start_date < ? AND end_date >= ?",
      [end, start]
    ),
  ]);
  const occupied = new Set(reservations.map((row) => `${row.appointment_date}|${row.start_time}`));
  const days = {};
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = currentOttawaDate();
  for (let day = 1; day <= count; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const blocked = blocks.some((range) => range.start_date <= date && range.end_date >= date);
    days[date] = blocked ? [] : SLOT_TIMES.filter((time) =>
      !occupied.has(`${date}|${time}`) && (date > today || isFutureSlot(date, time))
    );
  }
  return days;
}

router.get("/availability", wrap(async (req, res) => {
  const month = str(req.query.month, 7);
  if (!MONTH.test(month) || Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) {
    return res.status(400).json({ message: "Choose a valid calendar month." });
  }
  res.set("Cache-Control", "no-store");
  res.json({ month, days: await availabilityForMonth(month) });
}));

router.get("/manage/:token", wrap(async (req, res) => {
  const appointment = await appointmentByToken(req.params.token);
  if (!appointment) return res.status(404).render("404", { page: "", title: "Page Not Found | Voltera Plus", description: "Page not found." });
  appointment.formattedDate = formatDate(appointment.appointment_date);
  appointment.formattedTime = formatTime(appointment.start_time);
  if (appointment.proposed_date) {
    appointment.formattedProposedDate = formatDate(appointment.proposed_date);
    appointment.formattedProposedTime = formatTime(appointment.proposed_start_time);
  }
  const attachments = await query(
    "SELECT id, OCTET_LENGTH(data) AS bytes FROM appointment_attachments WHERE appointment_id = ? ORDER BY id",
    [appointment.id]
  );
  res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
  res.render("appointment-manage", {
    page: "appointment",
    title: "Manage Your Appointment | Voltera Plus",
    description: "View and manage your Voltera Plus appointment request.",
    appointment,
    attachments,
    token: req.params.token,
    canChange: ["pending", "confirmed"].includes(appointment.status) && has24HoursNotice(appointment.appointment_date, appointment.start_time),
    initialMonth: currentOttawaMonth(),
    notice: req.query.notice || "",
    error: req.query.error || "",
  });
}));

router.get("/manage/:token/attachments/:attachmentId", wrap(async (req, res, next) => {
  if (!TOKEN.test(req.params.token)) return next();
  const attachment = (await query(
    "SELECT a.mime, a.data FROM appointment_attachments a JOIN appointments p ON p.id = a.appointment_id WHERE a.id = ? AND p.access_token_hash = ?",
    [Number(req.params.attachmentId) || 0, tokenHash(req.params.token)]
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

router.get("/", wrap(async (req, res) => renderBooking(res)));

router.post("/", parseBookingUpload, wrap(async (req, res) => {
  const body = req.body || {};
  if (str(body.website, 200)) return res.redirect("/");
  if (limited(req.ip)) return renderBooking(res, body, "Too many requests. Please call us instead.", 429);

  const appointment = {
    name: str(body.name, 150),
    email: str(body.email, 190).toLowerCase(),
    phone: str(body.phone, 40),
    service: str(body.service, 190),
    details: str(body.details, 4000),
    address: str(body.address, 500),
    date: str(body.appointment_date, 10),
    time: str(body.start_time, 5),
  };
  if (!appointment.name || !EMAIL.test(appointment.email) || !appointment.phone
      || !appointment.service || !appointment.details || !appointment.address) {
    return renderBooking(res, body, "Please complete all required fields with a valid email address.", 400);
  }
  if (!validSlot(appointment.date, appointment.time)) {
    return renderBooking(res, body, "Choose an available future date and a two-hour start time.", 400);
  }
  if (appointment.service !== "Emergency Service"
      && !(await query("SELECT id FROM services WHERE name = ? AND published = 1", [appointment.service]))[0]) {
    return renderBooking(res, body, "Please choose one of the listed services.", 400);
  }

  const photos = (req.files || []).map((file) => ({ file, mime: parseImage(file.buffer) }));
  if (photos.some((photo) => !photo.mime)) {
    return renderBooking(res, body, "One or more files is not a valid JPG, PNG or WebP image.", 400);
  }
  const turnstileStarted = !!(process.env.TURNSTILE_SITE_KEY || process.env.TURNSTILE_SECRET_KEY);
  if (turnstileStarted && (!process.env.TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY)) {
    console.error("Turnstile must have both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY configured.");
    return renderBooking(res, body, "Verification is temporarily unavailable. Please call us instead.", 503);
  }
  const verification = await verifyTurnstile(req, str(body["cf-turnstile-response"], 2048), "appointment");
  if (!verification.valid) {
    return renderBooking(
      res,
      body,
      verification.unavailable
        ? "Verification is temporarily unavailable. Please try again or call us."
        : "Please complete the security check and try again.",
      verification.unavailable ? 503 : 403
    );
  }

  try {
    tokenKey();
  } catch (e) {
    console.error("Appointment token encryption is not configured:", e.message);
    return renderBooking(res, body, "Online booking is temporarily unavailable. Please call us instead.", 503);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const encryptedToken = encryptToken(token);
  let id;
  try {
    id = await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        await lockAppointmentCalendar(conn);
        const [blocked] = await conn.execute(
          "SELECT id FROM appointment_blocks WHERE start_date <= ? AND end_date >= ? FOR UPDATE",
          [appointment.date, appointment.date]
        );
        if (blocked.length) throw new AppointmentError("BLOCKED", "That date is unavailable. Choose another date.");
        const [result] = await conn.execute(
          "INSERT INTO appointments (access_token_hash,access_token_encrypted,name,email,phone,service,details,address,appointment_date,start_time,status,internal_notes) VALUES (?,?,?,?,?,?,?,?,?,?,'pending','')",
          [tokenHash(token), encryptedToken, appointment.name, appointment.email, appointment.phone, appointment.service, appointment.details, appointment.address, appointment.date, `${appointment.time}:00`]
        );
        await conn.execute(
          "INSERT INTO appointment_slot_reservations (appointment_date,start_time,appointment_id,reservation_type) VALUES (?, ?, ?, 'current')",
          [appointment.date, `${appointment.time}:00`, result.insertId]
        );
        for (const { file, mime } of photos) {
          await conn.execute(
            "INSERT INTO appointment_attachments (appointment_id,mime,data) VALUES (?,?,?)",
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
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return renderBooking(res, body, "That time was just booked. Please choose another available slot.", 409);
    }
    if (e instanceof AppointmentError && e.code === "BLOCKED") {
      return renderBooking(res, body, e.message, 409);
    }
    throw e;
  }

  await sendNotice(id, "pending", res, true);
  res.redirect(`/appointments/manage/${token}?notice=requested`);
}));

router.post("/manage/:token/cancel", wrap(async (req, res) => {
  const token = req.params.token;
  if (!TOKEN.test(token)) return res.status(404).send("Appointment not found.");
  let id;
  try {
    id = await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute("SELECT * FROM appointments WHERE access_token_hash = ? FOR UPDATE", [tokenHash(token)]);
        const appointment = rows[0];
        if (!appointment) throw new AppointmentError("NOT_FOUND", "Appointment not found.");
        if (!["pending", "confirmed"].includes(appointment.status)) throw new AppointmentError("CLOSED", "This appointment can no longer be changed.");
        if (!has24HoursNotice(appointment.appointment_date, appointment.start_time)) {
          throw new AppointmentError("CUTOFF", "Appointments must be cancelled at least 24 hours in advance. Please call us for help.");
        }
        await conn.execute(
          "UPDATE appointments SET status = 'cancelled', proposed_date = NULL, proposed_start_time = NULL WHERE id = ?",
          [appointment.id]
        );
        await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ?", [appointment.id]);
        await conn.commit();
        return appointment.id;
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
  } catch (e) {
    if (e instanceof AppointmentError) {
      if (e.code === "NOT_FOUND") return res.status(404).send("Appointment not found.");
      return res.redirect(`/appointments/manage/${token}?error=${e.code === "CUTOFF" ? "cutoff" : "closed"}`);
    }
    throw e;
  }
  await sendNotice(id, "cancelled", res, true);
  res.redirect(`/appointments/manage/${token}?notice=cancelled`);
}));

router.post("/manage/:token/reschedule", wrap(async (req, res) => {
  const token = req.params.token;
  if (!TOKEN.test(token)) return res.status(404).send("Appointment not found.");
  const date = str(req.body.new_date, 10);
  const time = str(req.body.new_time, 5);
  if (!validSlot(date, time)) return res.redirect(`/appointments/manage/${token}?error=slot`);

  let result;
  try {
    result = await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute("SELECT * FROM appointments WHERE access_token_hash = ? FOR UPDATE", [tokenHash(token)]);
        const appointment = rows[0];
        if (!appointment) throw new AppointmentError("NOT_FOUND", "Appointment not found.");
        if (!["pending", "confirmed"].includes(appointment.status)) throw new AppointmentError("CLOSED", "This appointment can no longer be changed.");
        if (!has24HoursNotice(appointment.appointment_date, appointment.start_time)) {
          throw new AppointmentError("CUTOFF", "Appointments must be rescheduled at least 24 hours in advance.");
        }
        if (appointment.appointment_date === date && appointment.start_time.slice(0, 5) === time) {
          throw new AppointmentError("SAME_SLOT", "Choose a different available time.");
        }
        await lockAppointmentCalendar(conn);
        const [blocked] = await conn.execute(
          "SELECT id FROM appointment_blocks WHERE start_date <= ? AND end_date >= ? FOR UPDATE",
          [date, date]
        );
        if (blocked.length) throw new AppointmentError("BLOCKED", "That date is unavailable. Choose another date.");
        const [occupied] = await conn.execute(
          "SELECT appointment_id FROM appointment_slot_reservations WHERE appointment_date = ? AND start_time = ? FOR UPDATE",
          [date, `${time}:00`]
        );
        if (occupied.length && occupied[0].appointment_id !== appointment.id) {
          throw new AppointmentError("TAKEN", "That time is no longer available. Choose another slot.");
        }

        if (appointment.status === "pending") {
          await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ?", [appointment.id]);
          await conn.execute(
            "UPDATE appointments SET appointment_date = ?, start_time = ?, proposed_date = NULL, proposed_start_time = NULL WHERE id = ?",
            [date, `${time}:00`, appointment.id]
          );
          await conn.execute(
            "INSERT INTO appointment_slot_reservations (appointment_date,start_time,appointment_id,reservation_type) VALUES (?, ?, ?, 'current')",
            [date, `${time}:00`, appointment.id]
          );
          await conn.commit();
          return { id: appointment.id, event: "request-updated" };
        }

        await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ? AND reservation_type = 'proposed'", [appointment.id]);
        await conn.execute(
          "UPDATE appointments SET proposed_date = ?, proposed_start_time = ? WHERE id = ?",
          [date, `${time}:00`, appointment.id]
        );
        await conn.execute(
          "INSERT INTO appointment_slot_reservations (appointment_date,start_time,appointment_id,reservation_type) VALUES (?, ?, ?, 'proposed')",
          [date, `${time}:00`, appointment.id]
        );
        await conn.commit();
        return { id: appointment.id, event: "reschedule-requested" };
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
  } catch (e) {
    if (e instanceof AppointmentError) {
      const code = e.code === "CUTOFF" ? "cutoff"
        : e.code === "CLOSED" ? "closed"
          : e.code === "NOT_FOUND" ? "not-found" : "slot";
      if (e.code === "NOT_FOUND") return res.status(404).send("Appointment not found.");
      return res.redirect(`/appointments/manage/${token}?error=${code}`);
    }
    if (e.code === "ER_DUP_ENTRY") return res.redirect(`/appointments/manage/${token}?error=slot`);
    throw e;
  }
  await sendNotice(result.id, result.event, res, true);
  res.redirect(`/appointments/manage/${token}?notice=reschedule-requested`);
}));

module.exports = {
  router,
  sendNotice,
  appointmentByToken,
  availabilityForMonth,
  currentOttawaDate,
  currentOttawaMonth,
  formatDate,
  formatTime,
  lockAppointmentCalendar,
  validSlot,
  has24HoursNotice,
};

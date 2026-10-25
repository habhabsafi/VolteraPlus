const express = require("express");
const { query, withConnection } = require("../db");
const auth = require("./auth");
const content = require("./content");
const appointments = require("../appointments");

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
    query("SELECT (SELECT COUNT(*) FROM services) services, (SELECT COUNT(*) FROM people) people, (SELECT COUNT(*) FROM posts) posts, (SELECT COUNT(*) FROM reviews) reviews, (SELECT COUNT(*) FROM admin_users) users, (SELECT COUNT(*) FROM quote_requests WHERE status = 'new') newQuotes, (SELECT COUNT(*) FROM appointments WHERE status = 'pending') pendingAppointments"),
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

// --- appointment calendar and management
const MONTH = /^\d{4}-\d{2}$/;
const validMonth = (month) => MONTH.test(month) && Number(month.slice(5)) >= 1 && Number(month.slice(5)) <= 12;
const nextMonth = (month) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
};

router.get("/appointments", wrap(async (req, res) => {
  const requestedMonth = str(req.query.month, 7);
  const month = validMonth(requestedMonth) ? requestedMonth : appointments.currentOttawaMonth();
  const start = `${month}-01`;
  const end = nextMonth(month);
  const [rows, blocks] = await Promise.all([
    query(
      `SELECT id, name, service, appointment_date, TIME_FORMAT(start_time, '%H:%i') AS start_time,
              proposed_date, TIME_FORMAT(proposed_start_time, '%H:%i') AS proposed_start_time, status
       FROM appointments
       WHERE status IN ('pending','confirmed')
         AND ((appointment_date >= ? AND appointment_date < ?) OR (proposed_date >= ? AND proposed_date < ?))
       ORDER BY appointment_date, start_time`,
      [start, end, start, end]
    ),
    query(
      "SELECT id, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, reason FROM appointment_blocks WHERE start_date < ? AND end_date >= ? ORDER BY start_date",
      [end, start]
    ),
  ]);
  const events = new Map();
  const addEvent = (date, row, type, time) => {
    if (!date) return;
    const key = String(date).slice(0, 10);
    if (!events.has(key)) events.set(key, []);
    events.get(key).push({ id: row.id, name: row.name, service: row.service, status: row.status, type, time });
  };
  rows.forEach((row) => {
    const date = String(row.appointment_date).slice(0, 10);
    if (date >= start && date < end) addEvent(date, row, "Appointment", row.start_time);
    if (row.proposed_date) {
      const proposedDate = String(row.proposed_date).slice(0, 10);
      if (proposedDate >= start && proposedDate < end) addEvent(proposedDate, row, "Reschedule requested", row.proposed_start_time);
    }
  });
  for (const dayEvents of events.values()) dayEvents.sort((a, b) => a.time.localeCompare(b.time));
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const cells = Array(offset).fill(null);
  for (let day = 1; day <= dayCount; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, events: events.get(date) || [] });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
  const followingMonth = end.slice(0, 7);
  const monthTitle = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" })
    .format(new Date(`${start}T00:00:00Z`));
  res.render("admin/appointments", {
    nav: "appointments",
    month,
    monthTitle,
    previousMonth,
    followingMonth,
    weeks,
    blocks,
    today: appointments.currentOttawaDate(),
    error: req.query.error === "block"
      ? "Enter a valid date range that starts today or later."
      : req.query.error === "block-booked"
        ? "That range contains a pending or confirmed appointment. Move or cancel it before blocking those dates."
        : null,
    saved: req.query.saved === "1",
  });
}));

router.post("/appointments/blocks", wrap(async (req, res) => {
  const startDate = str(req.body.start_date, 10);
  const endDate = str(req.body.end_date, 10);
  const reason = str(req.body.reason, 255) || "Unavailable";
  if (!appointments.validSlot(startDate, "08:00", false) || !appointments.validSlot(endDate, "08:00", false)
      || startDate < appointments.currentOttawaDate() || endDate < startDate) {
    return res.redirect("/admin/appointments?error=block");
  }
  try {
    await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        await appointments.lockAppointmentCalendar(conn);
        const [reserved] = await conn.execute(
          "SELECT appointment_id FROM appointment_slot_reservations WHERE appointment_date >= ? AND appointment_date <= ? FOR UPDATE",
          [startDate, endDate]
        );
        if (reserved.length) throw new Error("Appointments exist in the selected date range.");
        await conn.execute("INSERT INTO appointment_blocks (start_date,end_date,reason) VALUES (?,?,?)", [startDate, endDate, reason]);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
  } catch (e) {
    if (e.message === "Appointments exist in the selected date range.") {
      return res.redirect("/admin/appointments?error=block-booked");
    }
    throw e;
  }
  res.redirect("/admin/appointments?saved=1");
}));

router.post("/appointments/blocks/:id/delete", wrap(async (req, res) => {
  await query("DELETE FROM appointment_blocks WHERE id = ?", [Number(req.params.id) || 0]);
  res.redirect("/admin/appointments?saved=1");
}));

async function appointmentDetail(res, id, error = null, status = 200) {
  const appointment = (await query("SELECT * FROM appointments WHERE id = ?", [id]))[0];
  if (!appointment) return res.status(404).render("admin/error", { message: "Appointment not found." });
  appointment.formattedDate = appointments.formatDate(appointment.appointment_date);
  appointment.formattedTime = appointments.formatTime(appointment.start_time);
  if (appointment.proposed_date) {
    appointment.formattedProposedDate = appointments.formatDate(appointment.proposed_date);
    appointment.formattedProposedTime = appointments.formatTime(appointment.proposed_start_time);
  }
  const attachments = await query(
    "SELECT id, OCTET_LENGTH(data) AS bytes FROM appointment_attachments WHERE appointment_id = ? ORDER BY id",
    [appointment.id]
  );
  res.status(status).render("admin/appointment-detail", {
    nav: "appointments",
    appointment,
    attachments,
    error,
    saved: false,
    today: appointments.currentOttawaDate(),
  });
}

router.get("/appointments/:id", wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const appointment = (await query("SELECT * FROM appointments WHERE id = ?", [id]))[0];
  if (!appointment) return res.status(404).render("admin/error", { message: "Appointment not found." });
  appointment.formattedDate = appointments.formatDate(appointment.appointment_date);
  appointment.formattedTime = appointments.formatTime(appointment.start_time);
  if (appointment.proposed_date) {
    appointment.formattedProposedDate = appointments.formatDate(appointment.proposed_date);
    appointment.formattedProposedTime = appointments.formatTime(appointment.proposed_start_time);
  }
  const attachments = await query(
    "SELECT id, OCTET_LENGTH(data) AS bytes FROM appointment_attachments WHERE appointment_id = ? ORDER BY id",
    [id]
  );
  res.render("admin/appointment-detail", {
    nav: "appointments",
    appointment,
    attachments,
    error: null,
    saved: req.query.saved === "1",
    today: appointments.currentOttawaDate(),
  });
}));

router.get("/appointments/:id/attachments/:attachmentId", wrap(async (req, res, next) => {
  const attachment = (await query(
    "SELECT mime, data FROM appointment_attachments WHERE id = ? AND appointment_id = ?",
    [Number(req.params.attachmentId) || 0, Number(req.params.id) || 0]
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

router.post("/appointments/:id/approve", wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  let event;
  try {
    event = await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute("SELECT * FROM appointments WHERE id = ? FOR UPDATE", [id]);
        const appointment = rows[0];
        if (!appointment || !["pending", "confirmed"].includes(appointment.status)) {
          throw new Error("Only pending appointments and reschedule requests can be approved.");
        }
        if (appointment.proposed_date) {
          if (!appointments.validSlot(String(appointment.proposed_date).slice(0, 10), appointment.proposed_start_time.slice(0, 5))) {
            throw new Error("The requested reschedule time has passed. Choose a new time before approving.");
          }
          await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ?", [id]);
          await conn.execute(
            "UPDATE appointments SET appointment_date = proposed_date, start_time = proposed_start_time, proposed_date = NULL, proposed_start_time = NULL, status = 'confirmed' WHERE id = ?",
            [id]
          );
          await conn.execute(
            "INSERT INTO appointment_slot_reservations (appointment_date,start_time,appointment_id,reservation_type) SELECT appointment_date,start_time,id,'current' FROM appointments WHERE id = ?",
            [id]
          );
          await conn.commit();
          return "rescheduled";
        }
        if (appointment.status !== "pending") throw new Error("This appointment is already confirmed.");
        if (!appointments.validSlot(String(appointment.appointment_date).slice(0, 10), appointment.start_time.slice(0, 5))) {
          throw new Error("This requested appointment time has passed. Reschedule it before approving.");
        }
        await conn.execute("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [id]);
        await conn.commit();
        return "confirmed";
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
  } catch (e) {
    if (["Only pending appointments and reschedule requests can be approved.", "This appointment is already confirmed.", "The requested reschedule time has passed. Choose a new time before approving.", "This requested appointment time has passed. Reschedule it before approving."].includes(e.message)) {
      return appointmentDetail(res, id, e.message, 400);
    }
    throw e;
  }
  await appointments.sendNotice(id, event, res);
  res.redirect(`/admin/appointments/${id}?saved=1`);
}));

router.post("/appointments/:id/reject", wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  let event;
  try {
    event = await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute("SELECT * FROM appointments WHERE id = ? FOR UPDATE", [id]);
        const appointment = rows[0];
        if (!appointment || !["pending", "confirmed"].includes(appointment.status)) throw new Error("This appointment can no longer be rejected.");
        if (appointment.proposed_date) {
          await conn.execute("UPDATE appointments SET proposed_date = NULL, proposed_start_time = NULL WHERE id = ?", [id]);
          await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ? AND reservation_type = 'proposed'", [id]);
          await conn.commit();
          return "reschedule-declined";
        }
        if (appointment.status !== "pending") throw new Error("Only pending appointments can be rejected.");
        await conn.execute("UPDATE appointments SET status = 'rejected' WHERE id = ?", [id]);
        await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ?", [id]);
        await conn.commit();
        return "rejected";
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
  } catch (e) {
    if (e.message === "This appointment can no longer be rejected." || e.message === "Only pending appointments can be rejected.") {
      return appointmentDetail(res, id, e.message, 400);
    }
    throw e;
  }
  await appointments.sendNotice(id, event, res);
  res.redirect(`/admin/appointments/${id}?saved=1`);
}));

router.post("/appointments/:id/cancel", wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const updated = await withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.execute("SELECT status FROM appointments WHERE id = ? FOR UPDATE", [id]);
      if (!rows[0] || !["pending", "confirmed"].includes(rows[0].status)) {
        await conn.rollback();
        return false;
      }
      await conn.execute("UPDATE appointments SET status = 'cancelled', proposed_date = NULL, proposed_start_time = NULL WHERE id = ?", [id]);
      await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ?", [id]);
      await conn.commit();
      return true;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
  if (!updated) return appointmentDetail(res, id, "This appointment can no longer be cancelled.", 400);
  await appointments.sendNotice(id, "cancelled", res);
  res.redirect(`/admin/appointments/${id}?saved=1`);
}));

router.post("/appointments/:id/reschedule", wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const date = str(req.body.appointment_date, 10);
  const time = str(req.body.start_time, 5);
  if (!appointments.validSlot(date, time)) return appointmentDetail(res, id, "Choose a valid future two-hour appointment slot.", 400);
  let wasPending = false;
  try {
    await withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute("SELECT * FROM appointments WHERE id = ? FOR UPDATE", [id]);
        const appointment = rows[0];
        if (!appointment || !["pending", "confirmed"].includes(appointment.status)) throw new Error("This appointment can no longer be rescheduled.");
        wasPending = appointment.status === "pending";
        if (String(appointment.appointment_date).slice(0, 10) === date && appointment.start_time.slice(0, 5) === time) {
          throw new Error("Choose a different time than the current appointment.");
        }
        await appointments.lockAppointmentCalendar(conn);
        const [blocked] = await conn.execute("SELECT id FROM appointment_blocks WHERE start_date <= ? AND end_date >= ? FOR UPDATE", [date, date]);
        if (blocked.length) throw new Error("That date is marked unavailable.");
        const [occupied] = await conn.execute(
          "SELECT appointment_id FROM appointment_slot_reservations WHERE appointment_date = ? AND start_time = ? FOR UPDATE",
          [date, `${time}:00`]
        );
        if (occupied.length && occupied[0].appointment_id !== id) throw new Error("That time is already booked.");
        await conn.execute("DELETE FROM appointment_slot_reservations WHERE appointment_id = ?", [id]);
        await conn.execute(
          "UPDATE appointments SET appointment_date = ?, start_time = ?, proposed_date = NULL, proposed_start_time = NULL WHERE id = ?",
          [date, `${time}:00`, id]
        );
        await conn.execute(
          "INSERT INTO appointment_slot_reservations (appointment_date,start_time,appointment_id,reservation_type) VALUES (?, ?, ?, 'current')",
          [date, `${time}:00`, id]
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    });
  } catch (e) {
    if (["This appointment can no longer be rescheduled.", "Choose a different time than the current appointment.", "That date is marked unavailable.", "That time is already booked."].includes(e.message)) {
      return appointmentDetail(res, id, e.message, 400);
    }
    if (e.code === "ER_DUP_ENTRY") return appointmentDetail(res, id, "That time was just booked. Choose another slot.", 409);
    throw e;
  }
  await appointments.sendNotice(id, wasPending ? "request-updated" : "rescheduled", res);
  res.redirect(`/admin/appointments/${id}?saved=1`);
}));

router.post("/appointments/:id/notes", wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  await query("UPDATE appointments SET internal_notes = ? WHERE id = ?", [str(req.body.internal_notes, 4000), id]);
  res.redirect(`/admin/appointments/${id}?saved=1`);
}));

module.exports = router;

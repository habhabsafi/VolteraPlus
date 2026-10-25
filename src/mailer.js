const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const configured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const fromAddress = () => process.env.MAIL_FROM;

// Resend sends over HTTPS.
async function sendViaResend(m) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: m.from, to: [m.to], reply_to: m.replyTo, subject: m.subject, text: m.text, html: m.html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Resend returned HTTP ${res.status}`);
    err.code = `RESEND_${res.status}`;
    throw err;
  }
}

async function sendQuoteEmails(q, site) {
  if (!configured()) {
    console.warn("Resend not configured; quote emails skipped.");
    return { sent: false, error: "No email settings found: set RESEND_API_KEY and MAIL_FROM on the server." };
  }
  const from = `"${site.name}" <${fromAddress()}>`;
  const to = process.env.MAIL_TO || site.email;
  const rows = [["Name", q.name], ["Email", q.email], ["Phone", q.phone || "-"], ["Service", q.service || "-"], ["Photos", q.photosCount ? `${q.photosCount} attached (view in admin)` : "None"], ["Source", q.source || "-"]];
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${k}</b></td><td>${esc(v)}</td></tr>`).join("");
  let sent = false;
  let error = "";
  try {
    await sendViaResend({
      from, to, replyTo: `"${q.name.replace(/"/g, "")}" <${q.email}>`,
      subject: `New estimate request from ${q.name}`,
      text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nMessage:\n${q.message || "-"}`,
      html: `<table>${table}</table><p><b>Message</b></p><p style="white-space:pre-wrap">${esc(q.message || "-")}</p>`,
    });
    sent = true;
  } catch (e) {
    console.error("Owner quote email failed:", e.code, e.message);
    error = `${e.code || ""} ${e.message}`.trim().slice(0, 500);
  }
  try {
    await sendViaResend({
      from, to: q.email, replyTo: to,
      subject: `We received your request | ${site.name}`,
      text: `Hi ${q.name},\n\nThanks for contacting ${site.name}. We received your request and will get back to you shortly.\nFor urgent matters call ${site.phone}.\n\n${site.name}`,
      html: `<p>Hi ${esc(q.name)},</p><p>Thanks for contacting ${esc(site.name)}. We received your request and will get back to you shortly.</p><p>For urgent matters call <b>${esc(site.phone)}</b>.</p><p>${esc(site.name)}</p>`,
    });
  } catch (e) {
    console.error("Customer confirmation email failed:", e.message);
  }
  return { sent, error };
}

const appointmentDate = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
}).format(new Date(`${String(date).slice(0, 10)}T00:00:00Z`));

const appointmentTime = (time) => {
  const [hour, minute] = String(time).slice(0, 5).split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`;
};

function googleCalendarUrl(appointment) {
  const start = `${String(appointment.appointment_date).slice(0, 10).replace(/-/g, "")}T${String(appointment.start_time).slice(0, 5).replace(":", "")}00`;
  const hour = Number(String(appointment.start_time).slice(0, 2)) + 2;
  const end = `${String(appointment.appointment_date).slice(0, 10).replace(/-/g, "")}T${String(hour).padStart(2, "0")}${String(appointment.start_time).slice(3, 5)}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${appointment.service} | ${appointment.siteName || "Voltera Plus"}`,
    dates: `${start}/${end}`,
    ctz: "America/Toronto",
    details: "Appointment with Voltera Plus.",
    location: appointment.address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function sendAppointmentEmails({ appointment, site, manageUrl, adminUrl, event, notifyAdmin = false }) {
  if (!configured()) {
    const error = "No email settings found: set RESEND_API_KEY and MAIL_FROM on the server.";
    console.warn("Resend not configured; appointment emails skipped.");
    return { sent: false, error };
  }
  const from = `"${site.name}" <${fromAddress()}>`;
  const adminEmail = process.env.MAIL_TO || site.email;
  const date = appointmentDate(appointment.appointment_date);
  const time = appointmentTime(appointment.start_time);
  const proposed = appointment.proposed_date
    ? `${appointmentDate(appointment.proposed_date)} at ${appointmentTime(appointment.proposed_start_time)}`
    : "";
  const summary = `${appointment.service}\n${date} at ${time} (Ottawa time)\n${appointment.address}`;
  const messageByEvent = {
    pending: {
      subject: `Appointment request received | ${site.name}`,
      text: `Hi ${appointment.name},\n\nWe received your appointment request. It is pending admin approval and is not confirmed yet.\n\n${summary}\n\nYou can view or manage this request here: ${manageUrl}\nPlease make reschedule or cancellation requests at least 24 hours before the appointment. For changes within 24 hours, call ${site.phone}.\n\n${site.name}`,
      intro: "We received your appointment request. It is pending approval and is not confirmed yet.",
    },
    confirmed: {
      subject: `Appointment confirmed | ${site.name}`,
      text: `Hi ${appointment.name},\n\nYour appointment is confirmed.\n\n${summary}\n\nAdd it to Google Calendar: ${googleCalendarUrl({ ...appointment, siteName: site.name })}\nManage this appointment: ${manageUrl}\nPlease make reschedule or cancellation requests at least 24 hours in advance. For changes within 24 hours, call ${site.phone}.\n\n${site.name}`,
      intro: "Your appointment is confirmed.",
    },
    rejected: {
      subject: `Appointment request update | ${site.name}`,
      text: `Hi ${appointment.name},\n\nUnfortunately, we cannot accept your appointment request for ${date} at ${time}.\n\nView your request or contact us: ${manageUrl}\nPlease make any reschedule or cancellation requests at least 24 hours in advance. For help, call ${site.phone}.\n\n${site.name}`,
      intro: "Unfortunately, we cannot accept this appointment request.",
    },
    cancelled: {
      subject: `Appointment cancelled | ${site.name}`,
      text: `Hi ${appointment.name},\n\nYour appointment for ${date} at ${time} has been cancelled.\n\nAppointment details: ${manageUrl}\nPlease make any further reschedule or cancellation requests at least 24 hours in advance. For help, call ${site.phone}.\n\n${site.name}`,
      intro: "Your appointment has been cancelled.",
    },
    "reschedule-requested": {
      subject: `Reschedule request received | ${site.name}`,
      text: `Hi ${appointment.name},\n\nWe received your request to reschedule your appointment to ${proposed}. Your existing confirmed appointment remains in place until we approve the change.\n\nCurrent appointment:\n${summary}\n\nManage your appointment: ${manageUrl}\nPlease request changes at least 24 hours in advance. For help, call ${site.phone}.\n\n${site.name}`,
      intro: `We received your request to reschedule to ${proposed}. Your existing confirmed appointment remains in place until we approve the change.`,
    },
    "request-updated": {
      subject: `Appointment request updated | ${site.name}`,
      text: `Hi ${appointment.name},\n\nYour pending appointment request has been updated. The new requested time is ${date} at ${time}. It is still pending admin approval and is not confirmed yet.\n\nManage your request: ${manageUrl}\nPlease request changes at least 24 hours in advance. For help, call ${site.phone}.\n\n${site.name}`,
      intro: `Your pending appointment request has been updated to ${date} at ${time}. It is still awaiting approval.`,
    },
    rescheduled: {
      subject: `Appointment rescheduled | ${site.name}`,
      text: `Hi ${appointment.name},\n\nYour appointment has been rescheduled and is confirmed for:\n\n${summary}\n\nAdd it to Google Calendar: ${googleCalendarUrl({ ...appointment, siteName: site.name })}\nManage this appointment: ${manageUrl}\nPlease request any further changes at least 24 hours in advance. For help, call ${site.phone}.\n\n${site.name}`,
      intro: "Your appointment has been rescheduled and is confirmed.",
    },
    "reschedule-declined": {
      subject: `Reschedule request update | ${site.name}`,
      text: `Hi ${appointment.name},\n\nWe could not approve your requested new time${proposed ? ` (${proposed})` : ""}. Your existing appointment remains confirmed for ${date} at ${time}.\n\nManage your appointment: ${manageUrl}\nPlease make any further reschedule or cancellation requests at least 24 hours in advance. For help, call ${site.phone}.\n\n${site.name}`,
      intro: `We could not approve the requested new time${proposed ? ` (${proposed})` : ""}. Your existing appointment remains confirmed for ${date} at ${time}.`,
    },
  };
  const notice = messageByEvent[event];
  if (!notice) throw new Error(`Unsupported appointment email event: ${event}`);
  const calendarText = event === "confirmed" || event === "rescheduled"
    ? `<p><a href="${esc(googleCalendarUrl({ ...appointment, siteName: site.name }))}">Add to Google Calendar</a></p>`
    : "";
  const customerHtml = `<p>Hi ${esc(appointment.name)},</p><p>${esc(notice.intro)}</p><p><b>${esc(appointment.service)}</b><br>${esc(date)} at ${esc(time)} (Ottawa time)<br>${esc(appointment.address)}</p>${calendarText}<p><a href="${esc(manageUrl)}">View or manage this appointment</a></p><p>Please make reschedule or cancellation requests at least 24 hours in advance. For changes within 24 hours, call <b>${esc(site.phone)}</b>.</p><p>${esc(site.name)}</p>`;
  let sent = false;
  const errors = [];
  try {
    await sendViaResend({
      from,
      to: appointment.email,
      replyTo: adminEmail,
      subject: notice.subject,
      text: notice.text,
      html: customerHtml,
    });
    sent = true;
  } catch (e) {
    console.error("Customer appointment email failed:", e.code, e.message);
    errors.push(`${e.code || ""} ${e.message}`.trim());
  }
  if (notifyAdmin) {
    try {
      await sendViaResend({
        from,
        to: adminEmail,
        replyTo: `"${appointment.name.replace(/"/g, "")}" <${appointment.email}>`,
        subject: `New appointment activity from ${appointment.name}`,
        text: `${event}\n\n${appointment.name}\n${appointment.email}\n${appointment.phone}\n${summary}\n\nDetails:\n${appointment.details}\n\nCustomer appointment link: ${manageUrl}\nAdmin appointment: ${adminUrl}`,
        html: `<p><b>${esc(event)}</b></p><p>${esc(appointment.name)}<br><a href="mailto:${esc(appointment.email)}">${esc(appointment.email)}</a><br>${esc(appointment.phone)}</p><p>${esc(appointment.service)}<br>${esc(date)} at ${esc(time)} (Ottawa time)<br>${esc(appointment.address)}</p><p><b>Details</b><br>${esc(appointment.details)}</p><p><a href="${esc(adminUrl)}">Open in admin</a></p>`,
      });
    } catch (e) {
      console.error("Owner appointment email failed:", e.code, e.message);
      errors.push(`${e.code || ""} ${e.message}`.trim());
    }
  }
  return { sent, error: errors.join("; ").slice(0, 500) };
}

// Used by the admin "send test email" button.
async function sendTestEmail(to) {
  if (!configured()) throw new Error("No email settings found: set RESEND_API_KEY and MAIL_FROM on the server.");
  await sendViaResend({ from: fromAddress(), to, subject: "Test email from your website", text: "Email sending is working." });
}

module.exports = { sendQuoteEmails, sendAppointmentEmails, sendTestEmail };

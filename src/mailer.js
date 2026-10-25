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

// Used by the admin "send test email" button.
async function sendTestEmail(to) {
  if (!configured()) throw new Error("No email settings found: set RESEND_API_KEY and MAIL_FROM on the server.");
  await sendViaResend({ from: fromAddress(), to, subject: "Test email from your website", text: "Email sending is working." });
}

module.exports = { sendQuoteEmails, sendTestEmail };

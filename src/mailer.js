const nodemailer = require("nodemailer");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const configured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

let transport;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

// Sends the owner notification and customer confirmation. Returns true if the owner email went out.
async function sendQuoteEmails(q, site) {
  if (!configured()) {
    console.warn("SMTP not configured; quote emails skipped.");
    return false;
  }
  const from = `"${site.name}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`;
  const to = process.env.MAIL_TO || site.email;
  const rows = [["Name", q.name], ["Email", q.email], ["Phone", q.phone || "-"], ["Service", q.service || "-"], ["Source", q.source || "-"]];
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${k}</b></td><td>${esc(v)}</td></tr>`).join("");
  let sent = false;
  try {
    await getTransport().sendMail({
      from, to, replyTo: `"${q.name.replace(/"/g, "")}" <${q.email}>`,
      subject: `New estimate request from ${q.name}`,
      text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nMessage:\n${q.message || "-"}`,
      html: `<table>${table}</table><p><b>Message</b></p><p style="white-space:pre-wrap">${esc(q.message || "-")}</p>`,
    });
    sent = true;
  } catch (e) {
    console.error("Owner quote email failed:", e.message);
  }
  try {
    await getTransport().sendMail({
      from, to: q.email, replyTo: to,
      subject: `We received your request | ${site.name}`,
      text: `Hi ${q.name},\n\nThanks for contacting ${site.name}. We received your request and will get back to you shortly.\nFor urgent matters call ${site.phone}.\n\n${site.name}`,
      html: `<p>Hi ${esc(q.name)},</p><p>Thanks for contacting ${esc(site.name)}. We received your request and will get back to you shortly.</p><p>For urgent matters call <b>${esc(site.phone)}</b>.</p><p>${esc(site.name)}</p>`,
    });
  } catch (e) {
    console.error("Customer confirmation email failed:", e.message);
  }
  return sent;
}

module.exports = { sendQuoteEmails };

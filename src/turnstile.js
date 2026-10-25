async function verifyTurnstile(req, token, action) {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!siteKey && !secret) return { valid: true, enabled: false };
  if (!siteKey || !secret) return { valid: false, unavailable: true };
  if (!token) return { valid: false, unavailable: false };

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: req.ip }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Siteverify returned HTTP ${response.status}`);
    const result = await response.json();
    const valid = result.success === true
      && String(result.hostname || "").toLowerCase() === req.hostname.toLowerCase()
      && result.action === action;
    return { valid, unavailable: false };
  } catch (e) {
    console.error("Turnstile verification unavailable:", e.message);
    return { valid: false, unavailable: true };
  }
}

module.exports = { verifyTurnstile };

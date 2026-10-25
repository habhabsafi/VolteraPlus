const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyTurnstile } = require("../../src/turnstile");

const previousSiteKey = process.env.TURNSTILE_SITE_KEY;
const previousSecret = process.env.TURNSTILE_SECRET_KEY;
const previousFetch = global.fetch;
const previousConsoleError = console.error;

test.beforeEach(() => {
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
});

test.after(() => {
  if (previousSiteKey === undefined) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = previousSiteKey;
  if (previousSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = previousSecret;
  global.fetch = previousFetch;
  console.error = previousConsoleError;
});

test("Turnstile is optional only when neither key is configured", async () => {
  assert.deepEqual(await verifyTurnstile({}, "", "quote"), { valid: true, enabled: false });

  process.env.TURNSTILE_SITE_KEY = "site-key";
  assert.deepEqual(await verifyTurnstile({}, "token", "quote"), { valid: false, unavailable: true });
});

test("Turnstile rejects an empty token without contacting the provider", async () => {
  process.env.TURNSTILE_SITE_KEY = "site-key";
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
  global.fetch = () => {
    throw new Error("fetch should not be called");
  };

  assert.deepEqual(await verifyTurnstile({}, "", "quote"), { valid: false, unavailable: false });
});

test("Turnstile sends the secret, token, and client IP and validates the response", async () => {
  process.env.TURNSTILE_SITE_KEY = "site-key";
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("secret"), "secret-key");
    assert.equal(options.body.get("response"), "response-token");
    assert.equal(options.body.get("remoteip"), "192.0.2.1");
    return {
      ok: true,
      json: async () => ({ success: true, hostname: "EXAMPLE.TEST", action: "quote" }),
    };
  };

  assert.deepEqual(
    await verifyTurnstile({ ip: "192.0.2.1", hostname: "example.test" }, "response-token", "quote"),
    { valid: true, unavailable: false }
  );
});

test("Turnstile rejects provider responses for a different host or action", async () => {
  process.env.TURNSTILE_SITE_KEY = "site-key";
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ success: true, hostname: "other.test", action: "appointment" }),
  });

  assert.deepEqual(
    await verifyTurnstile({ hostname: "example.test" }, "response-token", "quote"),
    { valid: false, unavailable: false }
  );
});

test("Turnstile reports provider failures as unavailable", async () => {
  process.env.TURNSTILE_SITE_KEY = "site-key";
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
  global.fetch = async () => ({ ok: false, status: 503 });
  console.error = () => {};

  assert.deepEqual(
    await verifyTurnstile({ hostname: "example.test" }, "response-token", "quote"),
    { valid: false, unavailable: true }
  );
});

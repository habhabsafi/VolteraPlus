const test = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, verifyPassword, csrfGuard, limiter } = require("../../src/admin/auth");

test("password hashes verify only the original password", () => {
  const hash = hashPassword("correct horse battery staple");

  assert.match(hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
  assert.equal(verifyPassword("wrong password", hash), false);
  assert.equal(verifyPassword("anything", "unknown$algorithm"), false);
});

test("CSRF guard rejects cross-site requests", () => {
  const req = {
    method: "POST",
    admin: null,
    get: (name) => (name === "sec-fetch-site" ? "cross-site" : undefined),
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send() {
      return this;
    },
  };
  let continued = false;

  csrfGuard(req, res, () => { continued = true; });

  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);
});

test("login limiter blocks after eight failures and can be cleared", () => {
  const key = `test-${process.pid}-${Date.now()}`;

  limiter.clear(key);
  for (let i = 0; i < 7; i++) limiter.fail(key);
  assert.equal(limiter.blocked(key), false);

  limiter.fail(key);
  assert.equal(limiter.blocked(key), true);
  limiter.clear(key);
  assert.equal(limiter.blocked(key), false);
});

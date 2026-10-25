const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashPassword,
  verifyPassword,
  csrfGuard,
  limiter,
  requireAdmin,
  requireOwner,
} = require("../../src/admin/auth");

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

test("CSRF guard permits same-origin requests with a valid session token", () => {
  const req = {
    method: "POST",
    admin: { id: 1 },
    csrf: "valid-token",
    body: { _csrf: "valid-token" },
    get: (name) => ({
      origin: "https://example.test",
      host: "example.test",
      "sec-fetch-site": "same-origin",
    })[name],
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

  assert.equal(res.statusCode, 200);
  assert.equal(continued, true);
});

test("CSRF guard rejects an invalid session token", () => {
  const req = {
    method: "POST",
    admin: { id: 1 },
    csrf: "valid-token",
    body: { _csrf: "wrong-token" },
    get: () => undefined,
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

test("admin guards enforce authentication and owner-only access", () => {
  const res = {
    statusCode: 200,
    location: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(location) {
      this.location = location;
      return this;
    },
    render() {
      return this;
    },
  };
  let continued = false;

  requireAdmin({}, res, () => { continued = true; });
  assert.equal(res.location, "/admin/login");
  assert.equal(continued, false);

  requireAdmin({ admin: { id: 1, role: "admin" } }, res, () => { continued = true; });
  assert.equal(continued, true);

  continued = false;
  requireOwner({ admin: { id: 1, role: "admin" } }, res, () => { continued = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);

  requireOwner({ admin: { id: 2, role: "owner" } }, res, () => { continued = true; });
  assert.equal(continued, true);
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

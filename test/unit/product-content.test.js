const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProductTags, sanitizeProductHtml } = require("../../src/product-content");

test("product tags are normalized, deduplicated, bounded, and delimiter-safe", () => {
  assert.deepEqual(
    normalizeProductTags("Calibration, insulation tester, CALIBRATION, unsafe|tag, <tag>,"),
    ["calibration", "insulation tester", "unsafetag", "tag"]
  );
});

test("product rich text retains formatting and removes unsafe markup and URLs", () => {
  const clean = sanitizeProductHtml(
    '<script>alert("x")</script><h2>Details</h2><p>Safe <strong>formatting</strong></p><a href="javascript:alert(1)">bad link</a>'
  );

  assert.match(clean, /<h2>Details<\/h2>/);
  assert.match(clean, /<strong>formatting<\/strong>/);
  assert.doesNotMatch(clean, /<script|javascript:/i);
  assert.match(clean, /bad link/);
});

test("product rich text rejects protocol-relative links and event attributes", () => {
  const clean = sanitizeProductHtml('<a href="//example.test" onclick="alert(1)">link</a>');

  assert.doesNotMatch(clean, /href=|onclick=/i);
  assert.match(clean, /link/);
});

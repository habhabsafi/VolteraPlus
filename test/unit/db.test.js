const test = require("node:test");
const assert = require("node:assert/strict");
const { parseJson } = require("../../src/db");

test("parseJson decodes stored JSON strings", () => {
  assert.deepEqual(parseJson('{"enabled":true,"items":[1,2]}'), {
    enabled: true,
    items: [1, 2],
  });
});

test("parseJson preserves values that are already parsed", () => {
  const value = { enabled: true };

  assert.equal(parseJson(value), value);
  assert.equal(parseJson(null), null);
});

test("parseJson surfaces malformed stored JSON", () => {
  assert.throws(() => parseJson("{invalid"), SyntaxError);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseItems } = require("../../src/products");

test("product quote items accept unique slugs and bounded integer quantities", () => {
  assert.deepEqual(parseItems('[{"slug":"calibration-box","quantity":3}]'), {
    items: [{ slug: "calibration-box", quantity: 3 }],
  });
  assert.deepEqual(parseItems('[{"slug":"product","quantity":1},{"slug":"other-product","quantity":99}]'), {
    items: [{ slug: "product", quantity: 1 }, { slug: "other-product", quantity: 99 }],
  });
});

test("product quote items reject malformed JSON, empty carts, and excessive carts", () => {
  assert.ok(parseItems("{bad").error);
  assert.ok(parseItems("[]").error);
  assert.ok(parseItems(JSON.stringify(Array.from({ length: 51 }, (_, index) => ({
    slug: `product-${index}`,
    quantity: 1,
  })))).error);
});

test("product quote items reject invalid slugs and quantities", () => {
  for (const item of [
    { slug: "../product", quantity: 1 },
    { slug: "valid-product", quantity: 0 },
    { slug: "valid-product", quantity: 100 },
    { slug: "valid-product", quantity: 1.5 },
  ]) {
    assert.ok(parseItems(JSON.stringify([item])).error);
  }
});

test("product quote items reject duplicate products", () => {
  assert.match(
    parseItems('[{"slug":"product","quantity":1},{"slug":"product","quantity":2}]').error,
    /duplicate/i
  );
});

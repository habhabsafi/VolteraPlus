const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

const view = (...parts) => path.join(__dirname, "..", "..", "views", "admin", ...parts);
const admin = { email: "owner@example.test", role: "owner" };
const imgUrl = (image) => image.startsWith("uploads/") ? `/${image}` : `/images/${image}`;

test("product administration view exposes category management and product status", async () => {
  const html = await ejs.renderFile(view("products.ejs"), {
    admin,
    csrf: "csrf-token",
    error: null,
    saved: false,
    nav: "products",
    imgUrl,
    products: [{
      id: 7,
      slug: "test-product",
      title: "Test product",
      image: "uploads/test.jpg",
      category_name: "Test equipment",
      sort_order: 1,
      published: 1,
    }],
    categories: [{ id: 2, name: "Test equipment", slug: "test-equipment", sort_order: 1, product_count: 1 }],
  });

  assert.match(html, /New category/);
  assert.match(html, /Test equipment/);
  assert.match(html, /Published/);
  assert.match(html, /src="\/uploads\/test\.jpg"/);
});

test("product editor renders image, category, tag, and rich-text controls", async () => {
  const html = await ejs.renderFile(view("product-form.ejs"), {
    admin,
    csrf: "csrf-token",
    error: null,
    saved: false,
    nav: "products",
    imgUrl,
    isNew: false,
    product: {
      id: 7,
      slug: "test-product",
      title: "Test product",
      image: "panel.jpg",
      category_id: 2,
      tags: "calibration, tester",
      description: "<p>Product <strong>description</strong></p>",
      details: "<p>Product details</p>",
      sort_order: 1,
      published: 1,
    },
    categories: [{ id: 2, name: "Test equipment" }],
    images: ["panel.jpg", "uploads/test.jpg"],
  });

  assert.match(html, /name="title"/);
  assert.match(html, /name="category_id"/);
  assert.match(html, /name="tags"/);
  assert.match(html, /data-rich-command="bold"/);
  assert.match(html, /contenteditable="true"/);
  assert.match(html, /name="description"/);
  assert.match(html, /name="details"/);
});

test("product quote administration views expose line items and status controls", async () => {
  const list = await ejs.renderFile(view("product-quotes.ejs"), {
    admin,
    csrf: "csrf-token",
    error: null,
    saved: false,
    nav: "product-quotes",
    filter: "new",
    counts: { new: 1 },
    quotes: [{
      id: 9,
      name: "Quote Customer",
      email: "customer@example.test",
      phone: "613-555-0100",
      status: "new",
      item_count: 2,
      created_at: "2026-10-25 12:00:00",
    }],
  });
  const detail = await ejs.renderFile(view("product-quote-detail.ejs"), {
    admin,
    csrf: "csrf-token",
    error: null,
    saved: false,
    nav: "product-quotes",
    imgUrl,
    quote: {
      id: 9,
      name: "Quote Customer",
      email: "customer@example.test",
      phone: "613-555-0100",
      created_at: "2026-10-25 12:00:00",
      email_sent: 1,
      email_error: "",
      message: "Additional project details",
      status: "new",
      notes: "",
    },
    items: [{
      product_id: 7,
      product_title: "Test product",
      product_slug: "test-product",
      product_image: "panel.jpg",
      quantity: 2,
    }],
  });

  assert.match(list, /Product quote requests/);
  assert.match(list, /Quote Customer/);
  assert.match(detail, /Requested products/);
  assert.match(detail, /Test product/);
  assert.match(detail, /name="status"/);
  assert.match(detail, /Internal notes/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { createApp } = require("../../server");

const emptyStore = {
  getSite: async () => ({
    name: "Voltera Plus",
    phone: "613-555-0100",
    email: "hello@example.test",
  }),
  getCategories: async () => [],
  getFeaturedServices: async () => [],
  getReviews: async () => [],
  getPosts: async () => [],
  getServices: async () => [],
  getPeople: async () => [],
  getService: async () => null,
  getPost: async () => null,
  getNextService: async () => null,
  getRelatedPosts: async () => [],
};

const server = createServer(createApp({ initialize: async () => {}, contentStore: emptyStore }));
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("home page renders through the HTTP stack with security headers", async () => {
  const response = await fetch(baseUrl);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(html, /<title>Voltera Plus \| Electrical, general contracting and handy man Services in Ottawa, ON<\/title>/);
  assert.match(html, /Certified\. <em>Red Seal\.<\/em> Licensed\. Trusted\./);
  assert.match(html, /hello@example\.test/);
});

test("public pages render and legacy URLs redirect permanently", async () => {
  for (const [route, heading] of [
    ["/about", "About | Voltera Plus"],
    ["/services", "Services | Voltera Plus"],
    ["/reviews", "Reviews | Voltera Plus"],
    ["/blog", "Blog | Voltera Plus"],
    ["/contact", "Contact | Voltera Plus"],
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    const html = await response.text();

    assert.equal(response.status, 200, `${route} status`);
    assert.ok(html.includes(`<title>${heading}</title>`), `${route} title`);
  }

  const redirect = await fetch(`${baseUrl}/about.html`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/about");
});

test("robots and sitemap expose expected public routes", async () => {
  const robots = await fetch(`${baseUrl}/robots.txt`);
  const robotsBody = await robots.text();
  assert.equal(robots.status, 200);
  assert.match(robotsBody, /Disallow: \/admin/);
  assert.match(robotsBody, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  const sitemapBody = await sitemap.text();
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /application\/xml/);
  assert.match(sitemapBody, /<loc>http:\/\/127\.0\.0\.1:\d+\/book-appointment<\/loc>/);
});

test("unknown routes return the rendered 404 page", async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  const html = await response.text();

  assert.equal(response.status, 404);
  assert.match(html, /<div class="big">404<\/div>/);
  assert.match(html, /Page Not Found \| Voltera Plus/);
});

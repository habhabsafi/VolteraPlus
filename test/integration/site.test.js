const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { createApp } = require("../../server");

const service = {
  id: "test-service",
  cat: "electric",
  name: "Test Electrical Service",
  img: "panel.jpg",
  short: "A test service description.",
  why: "A test reason to choose the service.",
  perks: ["Test service benefit"],
  hub: [{ title: "Test service topic", text: "Test service details." }],
};
const posts = [
  {
    id: 101,
    title: "Test Electrical Article",
    img: "panel.jpg",
    cta: "Read Article",
    short: "A test article summary.",
    sections: [{ heading: "Test article section", text: "Test article content." }],
    date: "October 25, 2026",
  },
  {
    id: 102,
    title: "Related Test Article",
    img: "house.jpg",
    cta: "Read More",
    short: "A related article summary.",
    sections: [],
    date: "October 24, 2026",
  },
];
const fakeStore = {
  getSite: async () => ({
    name: "Voltera Plus",
    phone: "613-555-0100",
    email: "hello@example.test",
  }),
  getCategories: async () => [{ id: "electric", name: "Electrical" }],
  getFeaturedServices: async (category) => category === service.cat ? [service] : [],
  getReviews: async (limit) => {
    const reviews = [{ title: "Test review", body: "Test review details.", name: "Test Customer", role: "Homeowner" }];
    return limit ? reviews.slice(0, limit) : reviews;
  },
  getPosts: async (limit) => limit ? posts.slice(0, limit) : posts,
  getServices: async () => [service],
  getPeople: async () => [{
    id: 1,
    name: "Test Electrician",
    role: "Licensed Electrician",
    headline: "Test team profile",
    bio: "Test team biography.",
    img: "abe.jpg",
    highlights: ["Test credential"],
    badge_img: "red-seal.png",
  }],
  getService: async (id) => id === service.id ? service : null,
  getPost: async (id) => posts.find((post) => post.id === Number(id)) || null,
  getNextService: async () => service,
  getRelatedPosts: async (id) => posts.filter((post) => post.id !== Number(id)),
};

const server = createServer(createApp({ initialize: async () => {}, contentStore: fakeStore }));
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
    if (route === "/about") assert.match(html, /Test team profile/);
    if (route === "/services") assert.match(html, /Test Electrical Service/);
    if (route === "/reviews") assert.match(html, /Test review details/);
    if (route === "/blog") assert.match(html, /Test Electrical Article/);
  }

  const redirect = await fetch(`${baseUrl}/about.html`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/about");
});

test("service and article detail pages render populated content", async () => {
  const serviceResponse = await fetch(`${baseUrl}/services/${service.id}`);
  const serviceHtml = await serviceResponse.text();
  assert.equal(serviceResponse.status, 200);
  assert.match(serviceHtml, /<title>Test Electrical Service \| Voltera Plus<\/title>/);
  assert.match(serviceHtml, /Test service benefit/);
  assert.match(serviceHtml, /Test service details/);

  const articleResponse = await fetch(`${baseUrl}/blog/101`);
  const articleHtml = await articleResponse.text();
  assert.equal(articleResponse.status, 200);
  assert.match(articleHtml, /<title>Test Electrical Article \| Voltera Plus<\/title>/);
  assert.match(articleHtml, /Test article section/);
  assert.match(articleHtml, /Related Test Article/);
});

test("dynamic detail routes return 404 for missing records", async () => {
  for (const route of ["/services/missing-service", "/blog/999"]) {
    const response = await fetch(`${baseUrl}${route}`);
    const html = await response.text();

    assert.equal(response.status, 404, route);
    assert.match(html, /Page Not Found \| Voltera Plus/, route);
  }
});

test("dynamic page content is HTML-escaped", async () => {
  const originalName = service.name;
  service.name = "<script>alert(1)</script>";

  try {
    const response = await fetch(`${baseUrl}/services/${service.id}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  } finally {
    service.name = originalName;
  }
});

test("appointment form renders with the calendar and privacy metadata", async () => {
  const response = await fetch(`${baseUrl}/book-appointment`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<title>Book an Appointment \| Voltera Plus<\/title>/);
  assert.match(html, /action="\/appointments"/);
  assert.match(html, /data-availability="\/appointments\/availability"/);
  assert.match(html, /name="appointment_date"/);
});

test("quote form endpoint accepts honeypot submissions without saving them", async () => {
  const response = await fetch(`${baseUrl}/quote`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ website: "filled-by-a-bot" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, message: "Thank you!" });
});

test("quote form endpoint rejects invalid customer details", async () => {
  const response = await fetch(`${baseUrl}/quote`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ Name: "Customer", Email: "not-an-email", Service: "Repair" }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    message: "Please enter your name, a valid email and a service.",
  });
});

test("quote form endpoint rejects files with invalid image signatures", async () => {
  const form = new FormData();
  form.append("Name", "Customer");
  form.append("Email", "customer@example.test");
  form.append("Service", "Repair");
  form.append("photos", new Blob(["not an image"], { type: "image/jpeg" }), "photo.jpg");
  const response = await fetch(`${baseUrl}/quote`, {
    method: "POST",
    headers: { accept: "application/json" },
    body: form,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    message: "One or more files is not a valid JPG, PNG or WebP image.",
  });
});

test("quote form endpoint rate-limits repeated submissions by client IP", async () => {
  const headers = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
    "x-forwarded-for": "198.51.100.40",
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${baseUrl}/quote`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ Name: "", Email: "invalid" }),
    });
    assert.equal(response.status, 400, `attempt ${attempt + 1}`);
  }

  const limited = await fetch(`${baseUrl}/quote`, {
    method: "POST",
    headers,
    body: new URLSearchParams({ Name: "", Email: "invalid" }),
  });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    ok: false,
    message: "Too many requests. Please call us instead.",
  });
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
  assert.match(sitemapBody, /<loc>http:\/\/127\.0\.0\.1:\d+\/services\/test-service<\/loc>/);
  assert.match(sitemapBody, /<loc>http:\/\/127\.0\.0\.1:\d+\/blog\/101<\/loc>/);
});

test("unknown routes return the rendered 404 page", async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  const html = await response.text();

  assert.equal(response.status, 404);
  assert.match(html, /<div class="big">404<\/div>/);
  assert.match(html, /Page Not Found \| Voltera Plus/);
});

test("public CSS asset is served as a static resource", async () => {
  const response = await fetch(`${baseUrl}/css/style.css`);
  const css = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/css/);
  assert.match(css, /\.site-header/);
});

require("dotenv").config({ quiet: true });
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const store = require("./src/store");
const { init } = require("./src/setup");
const adminRoutes = require("./src/admin/routes");
const quoteRoutes = require("./src/quote");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);
app.locals.imgUrl = (img) => (String(img).startsWith("uploads/") ? "/" + img : "/images/" + img);

app.use(
  helmet({
    referrerPolicy: { policy: "same-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  })
);
app.use(compression());
// Images uploaded through the admin are stored in MySQL so they survive redeploys.
app.get("/uploads/:name", async (req, res, next) => {
  try {
    const row = (await require("./src/db").query("SELECT mime, data FROM media WHERE name = ?", [req.params.name]))[0];
    if (!row) return next();
    res.set({ "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
    res.send(row.data);
  } catch (e) { next(e); }
});
app.use(express.static(path.join(__dirname, "public"), { maxAge: "7d" }));

// Shared template data
app.use(async (req, res, next) => {
  try {
    await init();
    res.locals.site = await store.getSite();
    res.locals.categories = await store.getCategories();
    res.locals.page = "";
    res.locals.title = "Voltera Plus | Electrical, general contracting and handy man Services in Ottawa, ON";
    res.locals.description =
      "Voltera Plus: Red Seal certified Electrical, general contracting and handy man in Ottawa, ON. 24/7 emergency service and free estimates.";
    res.locals.baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    res.locals.canonical = res.locals.baseUrl + req.path;
    next();
  } catch (e) {
    next(e);
  }
});

app.use("/admin", express.urlencoded({ extended: false, limit: "100kb" }), adminRoutes);

app.use("/quote", quoteRoutes);

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.get("/", wrap(async (req, res) => {
  const [electric, general, handy, reviews, posts, allServices] = await Promise.all([
    store.getFeaturedServices("electric"),
    store.getFeaturedServices("general-contractor"),
    store.getFeaturedServices("handyman"),
    store.getReviews(3),
    store.getPosts(3),
    store.getServices(),
  ]);
  res.render("home", { page: "home", featured: { electric, general, handy }, reviews, posts, allServices });
}));

app.get("/about", wrap(async (req, res) =>
  res.render("about", { page: "about", title: "About | Voltera Plus", description: "Meet the Voltera Plus team serving Ottawa, ON.", people: await store.getPeople() })));

app.get("/services", wrap(async (req, res) => {
  const [services, reviews] = await Promise.all([store.getServices(), store.getReviews(3)]);
  res.render("services", { page: "services", title: "Services | Voltera Plus", description: "Electrical, general contractor and handy man services in Ottawa, ON.", services, reviews, allServices: services });
}));

app.get("/services/:id", wrap(async (req, res, next) => {
  const service = await store.getService(req.params.id);
  if (!service) return next();
  const [next_, allServices] = await Promise.all([store.getNextService(service.id), store.getServices()]);
  res.render("service-details", { page: "services", title: `${service.name} | Voltera Plus`, description: service.short, service, hubImage: next_.img, allServices });
}));

app.get("/reviews", wrap(async (req, res) => {
  res.render("reviews", { page: "reviews", title: "Reviews | Voltera Plus", description: "What homeowners and businesses say about Voltera Plus.", reviews: await store.getReviews() });
}));

app.get("/blog", wrap(async (req, res) => {
  res.render("blog", { page: "blog", title: "Blog | Voltera Plus", description: "Electrical tips, safety advice, and news from Voltera Plus.", posts: await store.getPosts() });
}));

app.get("/blog/:id", wrap(async (req, res, next) => {
  const post = await store.getPost(req.params.id);
  if (!post) return next();
  res.render("blog-details", { page: "blog", title: `${post.title} | Voltera Plus`, description: post.short, post, more: await store.getRelatedPosts(post.id) });
}));

app.get("/contact", wrap(async (req, res) => {
  res.render("contact", { page: "contact", sent: req.query.sent === "1", title: "Contact | Voltera Plus", description: "Request a free estimate or call Voltera Plus 24/7.", allServices: await store.getServices() });
}));

// Redirect legacy .html URLs
const legacy = { "index.html": "/", "about.html": "/about", "services.html": "/services", "reviews.html": "/reviews", "blog.html": "/blog", "contact.html": "/contact" };
app.get("/:file.html", (req, res, next) => {
  const to = legacy[`${req.params.file}.html`];
  if (to) return res.redirect(301, to);
  if (req.params.file === "service-details" && req.query.id) return res.redirect(301, `/services/${encodeURIComponent(req.query.id)}`);
  if (req.params.file === "blog-details" && req.query.id) return res.redirect(301, `/blog/${encodeURIComponent(req.query.id)}`);
  next();
});

app.get("/robots.txt", (req, res) =>
  res.type("text/plain").send(`User-agent: *\nDisallow: /admin\nAllow: /\nSitemap: ${res.locals.baseUrl}/sitemap.xml\n`));

app.get("/sitemap.xml", wrap(async (req, res) => {
  const [services, posts] = await Promise.all([store.getServices(), store.getPosts()]);
  const urls = ["/", "/about", "/services", "/reviews", "/blog", "/contact", ...services.map((s) => `/services/${s.id}`), ...posts.map((p) => `/blog/${p.id}`)];
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${res.locals.baseUrl}${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
}));

app.use((req, res) => res.status(404).render("404", { page: "", title: "Page Not Found | Voltera Plus", description: "Page not found." }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type("text/plain").send("Something went wrong.");
});

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
module.exports = app;





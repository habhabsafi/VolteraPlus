const fs = require("fs");
const path = require("path");
const { withConnection } = require("./db");

const dir = path.join(__dirname, "..", "migrations");

async function migrate() {
  await withConnection(async (c) => {
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    const [rows] = await c.query("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await c.query(fs.readFileSync(path.join(dir, file), "utf8"));
      await c.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      console.log("Applied migration", file);
    }
  }, { multipleStatements: true });
}

const FEATURED = {
  electric: ["troubleshooting", "panel-upgrades", "lighting"],
  "general-contractor": ["renovations", "additions", "project-management"],
  handyman: ["home-repairs", "painting", "assembly-mounting"],
};

const monthIndex = (d) => new Date(`${d} UTC`).toISOString().slice(0, 10);

// Imports the original content once, when the tables are empty.
async function seed() {
  const load = (n) => require(`./data/${n}.json`);
  await withConnection(async (c) => {
    const count = async (t) => (await c.query(`SELECT COUNT(*) n FROM ${t}`))[0][0].n;

    if (!(await count("site_settings"))) {
      const s = load("site");
      await c.execute("INSERT INTO site_settings (id,name,tagline,owner,title,phone,email,web,area) VALUES (1,?,?,?,?,?,?,?,?)",
        [s.name, s.tagline, s.owner, s.title, s.phone, s.email, s.web, s.area]);
    }
    if (!(await count("categories"))) {
      for (const [i, cat] of load("categories").entries())
        await c.execute("INSERT INTO categories (id,name,sort_order) VALUES (?,?,?)", [cat.id, cat.name, i]);
    }
    if (!(await count("services"))) {
      for (const [i, s] of load("services").entries()) {
        const f = (FEATURED[s.cat] || []).indexOf(s.id) + 1;
        await c.execute("INSERT INTO services (id,cat,name,img,short,why,perks,hub,sort_order,featured_order) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [s.id, s.cat, s.name, s.img, s.short, s.why, JSON.stringify(s.perks), JSON.stringify(s.hub), i, f]);
      }
    }
    if (!(await count("reviews"))) {
      for (const [i, r] of load("reviews").entries())
        await c.execute("INSERT INTO reviews (title,body,name,role,sort_order) VALUES (?,?,?,?,?)", [r.title, r.body, r.name, r.role, i]);
    }
    if (!(await count("posts"))) {
      for (const p of load("posts"))
        await c.execute("INSERT INTO posts (id,title,img,cta,short,sections,published_at) VALUES (?,?,?,?,?,?,?)",
          [p.id, p.title, p.img, p.cta, p.short, JSON.stringify(p.sections), monthIndex(p.date)]);
    }
  });
}

let ready;
// Runs once per process; failed attempts can be retried.
function init() {
  if (!ready) ready = migrate().then(seed).catch((e) => { ready = null; throw e; });
  return ready;
}

module.exports = { init };

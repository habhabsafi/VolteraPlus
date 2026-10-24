# Voltera Plus

Website for Voltera Plus, a Red Seal certified Electrical, general contracting and handy man company serving Ottawa, ON and surrounding areas.

Server-rendered Node.js site using Express and EJS. Every page is real HTML for SEO.

## Run locally

```
npm install
npm run dev     # http://localhost:3000
```

Requires Node 20+. Set `BASE_URL` (e.g. `https://www.volteraplus.ca`) in production for canonical URLs and the sitemap.

## Production database and migrations

Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in the Node.js application's environment. On startup, the application applies numbered SQL files from `migrations/` in order and records each completed migration in `schema_migrations`. This includes new migrations such as `005_people.sql`; no separate shell command is required, but the configured database user must be allowed to create and alter tables.

Initial content is seeded only when its corresponding table is empty. Existing database content is not overwritten during deployment. Back up the database before deploying schema changes, and keep the database credentials in the hosting environment rather than in source control.

## Structure

- `server.js`: routes, security headers, legacy `.html` redirects, sitemap and robots
- `src/store.js`: database-backed public content access
- `src/setup.js`: startup migrations and initial content seeding
- `migrations/`: ordered MySQL/MariaDB schema migrations
- `src/data/*.json`: initial seed content
- `src/admin/`: admin authentication, CRUD routes, and content handling
- `views/`: EJS pages; `views/partials/`: header, footer, cards, forms
- `public/`: CSS, client JS, and images

Manage services, team members, blog posts, reviews, and site settings through `/admin`. Uploaded images are stored in the database so they persist across application redeployments.

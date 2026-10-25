# Voltera Plus

Website for Voltera Plus, a Red Seal certified Electrical, general contracting and handy man company serving Ottawa, ON and surrounding areas.

Server-rendered Node.js site using Express and EJS. Every page is real HTML for SEO.

Quote photos are stored as private MySQL attachments, not in the source tree or public assets. Admin users can view them from the quote details page. Uploads are limited to three JPG, PNG or WebP files at 2 MB each.

Quote forms support Cloudflare Turnstile when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set. Both are required to enable verification; submissions are verified server-side before they are saved. Without either key, the existing honeypot and rate limit remain active.

## Appointments

Customers can request appointments at `/book-appointment`. Appointments are two hours, offered every day (including weekends) at 8:00 a.m., 10:00 a.m., noon, 2:00 p.m., and 4:00 p.m. Ottawa time. Pending and confirmed appointments reserve their time. Customers receive a private link to view, reschedule, or cancel without creating an account; rescheduling and cancellation close 24 hours before the appointment. Customer reschedule requests for confirmed appointments keep the current time reserved until an admin approves the change.

Manage appointments and unavailable date ranges in `/admin/appointments`. Blocking a range that contains any pending or confirmed booking is prevented; move or cancel those appointments first. Appointment email uses the existing Resend settings. Set `APPOINTMENT_TOKEN_SECRET` to a persistent 64-character hexadecimal key (generate one with the command in `.env.example`) so management-link tokens can be encrypted for future email notifications. Keep this secret in the hosting environment and do not rotate it while appointments are active.

Cloudflare Turnstile is reused for appointment submissions when both Turnstile keys are configured. Confirmation emails include a Google Calendar add link for customers. Admin Google Calendar synchronization is not enabled, so no Google Workspace API or paid scheduling provider is required.

## Run locally

```
npm install
npm run dev     # http://localhost:3000
```

Requires Node 20+. Set `BASE_URL` (e.g. `https://www.volteraplus.ca`) in production for canonical URLs and the sitemap.

## Tests and pull requests

Run the unit and HTTP integration tests from `site/` with `npm test`. The tests use Node's built-in test runner and do not require database credentials. GitHub Actions runs them on pull requests targeting `main` or `master`.

To prevent merging until they pass, an administrator must configure repository branch protection or a ruleset for each target branch (`main` and/or `master`) and require the **Test website / test** status check. The check appears after the workflow runs once. The workflow reports this check but cannot enable GitHub's repository-level merge rules by itself.

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

# Voltera Plus

Website for Voltera Plus, a Red Seal certified Electrical, general contracting and handy man company serving Ottawa, ON and surrounding areas.

Server-rendered Node.js site using Express and EJS. Every page is real HTML for SEO.

## Run locally

```
npm install
npm run dev     # http://localhost:3000
```

Requires Node 20+. Set `BASE_URL` (e.g. `https://www.volteraplus.ca`) in production for canonical URLs and the sitemap.

## Structure

- `server.js`: routes, security headers, legacy `.html` redirects, sitemap and robots
- `src/store.js`: data access layer (swap for database queries in the next phase)
- `src/data/*.json`: site info, services, reviews, and blog posts
- `views/`: EJS pages; `views/partials/`: header, footer, cards, forms
- `public/`: CSS, client JS, and images

## Editing content

Until the admin panel and database are added, edit the JSON files in `src/data/`.

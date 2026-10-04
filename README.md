# Voltera Plus

Website for Voltera Plus, a Red Seal certified electrical and general contracting company serving Ottawa, ON and surrounding areas.

Static site built with HTML, CSS, and vanilla JavaScript. No build step.

## Run locally

Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
```

## Structure

- `*.html`: pages (home, about, services, service details, reviews, blog, blog details, contact, 404)
- `css/style.css`: styles
- `js/main.js`: shared header/footer, service/review/blog data, forms
- `images/`: logo, Red Seal badge, and photos

## Editing content

Services, reviews, blog posts, and contact details are defined at the top of `js/main.js`.
Add a portrait of the owner at `images/abe.jpg` for the About page.

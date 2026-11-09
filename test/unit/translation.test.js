const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("switching to English resets Google Translate's language cookie", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../public/js/translation.js"), "utf8");
  const handlers = {};
  const attributes = {};
  const cookieWrites = [];
  const buttons = ["en", "fr"].map((language) => ({
    dataset: { language },
    addEventListener: (event, handler) => {
      handlers[language] = handler;
    },
    setAttribute: (name, value) => {
      attributes[language] = { ...attributes[language], [name]: value };
    },
  }));
  let cookie = "googtrans=/en/fr; googtrans=/en/fr";
  let reloads = 0;
  const document = {
    cookie,
    documentElement: { lang: "" },
    head: { appendChild() {} },
    querySelectorAll: () => buttons,
    querySelector: () => null,
    createElement: () => ({}),
  };
  Object.defineProperty(document, "cookie", {
    get: () => cookie,
    set: (value) => { cookieWrites.push(value); },
  });
  const window = {
    location: { hostname: "www.volteraplus.ca", reload: () => { reloads += 1; } },
    setTimeout() {},
  };

  vm.runInNewContext(source, { document, window });
  handlers.en();

  assert.deepEqual(cookieWrites.slice(-2), [
    "googtrans=/en/en; path=/; max-age=31536000; SameSite=Lax",
    "googtrans=/en/en; path=/; domain=volteraplus.ca; max-age=31536000; SameSite=Lax",
  ]);
  assert.equal(document.documentElement.lang, "en");
  assert.equal(attributes.en["aria-pressed"], "true");
  assert.equal(attributes.fr["aria-pressed"], "false");
  assert.equal(reloads, 1);
});

// Client-side behaviour: mobile nav, accordion, quote forms
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  $("#navToggle")?.addEventListener("click", () => $("#navLinks").classList.toggle("open"));

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".acc button");
    if (!b) return;
    const item = b.parentElement;
    const was = item.classList.contains("open");
    $$(".acc > div").forEach((d) => { d.classList.remove("open"); $("span", d).innerHTML = "+"; });
    if (!was) { item.classList.add("open"); $("span", item).innerHTML = "&minus;"; }
  });

  $(".video .play")?.addEventListener("click", () => alert("Add your company video here."));

  $$("form[data-form]").forEach((f) => {
    f.noValidate = true;
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      let ok = true;
      $$("[data-req]", f).forEach((inp) => {
        const v = inp.value.trim();
        const bad = !v || (inp.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
        inp.closest(".field").classList.toggle("bad", bad);
        if (bad) ok = false;
      });
      if (!ok) return;
      const ms = $(".form-ok", f);
      const btn = $("button[type=submit]", f);
      const show = (text, error) => { if (ms) { ms.style.display = "block"; ms.classList.toggle("error", !!error); ms.textContent = text; } };
      if (btn) btn.disabled = true;
      fetch(f.action, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(f)) })
        .then((r) => r.json().catch(() => ({ ok: false })))
        .then((d) => { show(d.message || "Something went wrong. Please call us.", !d.ok); if (d.ok) f.reset(); })
        .catch(() => show("Could not send your request. Please call us.", true))
        .finally(() => { if (btn) btn.disabled = false; });
    });
  });
})();

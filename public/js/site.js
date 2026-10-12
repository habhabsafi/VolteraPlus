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
      const d = Object.fromEntries(new FormData(f));
      const body = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join("\n");
      const ms = $(".form-ok", f);
      if (ms) { ms.style.display = "block"; ms.textContent = "Thank you! Your email app will open to send your request."; }
      location.href = `mailto:${document.body.dataset.email}?subject=${encodeURIComponent("Estimate request from website")}&body=${encodeURIComponent(body)}`;
      f.reset();
    });
  });
})();

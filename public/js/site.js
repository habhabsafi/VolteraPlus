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

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-confirm]");
    if (form && !window.confirm(form.dataset.confirm)) e.preventDefault();
  });

  $(".video .play")?.addEventListener("click", () => alert("Add your company video here."));

  $$("form[data-form]").forEach((f) => {
    const photoInput = $("input[name='photos']", f);
    const photoList = photoInput && $("#quote-photo-files", photoInput.closest(".field"));
    const updatePhotoList = () => {
      if (!photoInput || !photoList) return;
      const files = [...photoInput.files];
      const invalid = files.length > 3 || files.some((file) => file.size > 2 * 1024 * 1024);
      photoList.textContent = files.length
        ? files.map((file) => file.name).join(", ")
        : "No photos selected.";
      photoList.classList.toggle("photo-files-error", invalid);
      photoInput.closest(".field").classList.toggle("bad", invalid);
    };
    photoInput?.addEventListener("change", updatePhotoList);
    f.addEventListener("reset", () => window.setTimeout(updatePhotoList));
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
      if (photoInput && (photoInput.files.length > 3 || [...photoInput.files].some((file) => file.size > 2 * 1024 * 1024))) {
        updatePhotoList();
        photoInput.closest(".field").classList.add("bad");
        ok = false;
      } else {
        photoInput?.closest(".field").classList.remove("bad");
      }
      if (!ok) return;
      const ms = $(".form-ok", f);
      const btn = $("button[type=submit]", f);
      const show = (text, error) => { if (ms) { ms.style.display = "block"; ms.classList.toggle("error", !!error); ms.textContent = text; } };
      if (btn) btn.disabled = true;
      fetch(f.action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(f) })
        .then((r) => r.json().catch(() => ({ ok: false })))
        .then((d) => { show(d.message || "Something went wrong. Please call us.", !d.ok); if (d.ok) f.reset(); })
        .catch(() => show("Could not send your request. Please call us.", true))
        .finally(() => { if (btn) btn.disabled = false; });
    });
  });
})();

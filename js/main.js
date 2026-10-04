(function () {
  const SITE = {
    name: "Voltera Plus",
    tagline: "Building a better tomorrow.",
    owner: "Abe Barham",
    title: "Licensed Electrician",
    phone: "343 336 3433",
    email: "abe@volteraplus.ca",
    web: "www.volteraplus.ca",
    area: "Serving Ottawa, ON and Surrounding Areas",
  };

  const SERVICES = [
    { id: "residential", name: "Residential", img: "house.jpg", short: "Safe, code-compliant wiring, outlets, and upgrades for your home.",
      why: "Your home's electrical system should be safe, reliable, and ready for how you live today. From new outlets and EV charger circuits to full rewires, Voltera Plus delivers clean, code-compliant work.",
      perks: ["Wiring and rewiring", "Outlets, switches, and GFCI protection", "EV charger and appliance circuits"],
      hub: [["Safety First", "Every job is completed to the Canadian Electrical Code and inspected for your peace of mind."], ["Clean, Tidy Work", "We protect your space and leave it clean when we are done."], ["Honest Pricing", "Free estimates and clear quotes with no surprises."]] },
    { id: "commercial", name: "Commercial", img: "blueprint.jpg", short: "Electrical installs and maintenance that keep your business running.",
      why: "Downtime costs money. Voltera Plus plans and completes commercial electrical work for offices, retail, and restaurants with minimal disruption to your operation.",
      perks: ["Tenant improvements and build-outs", "Power distribution and sub-panels", "Scheduled maintenance and inspections"],
      hub: [["Minimal Downtime", "We schedule around your business hours."], ["Code Compliant", "Permits, inspections, and documentation handled properly."], ["Scalable Solutions", "Designs that are ready for your next expansion."]] },
    { id: "industrial", name: "Industrial", img: "site.jpg", short: "Heavy-duty power, motors, and controls for demanding environments.",
      why: "Industrial sites need robust electrical systems and a contractor who understands the risks. Voltera Plus works to strict safety standards on every project.",
      perks: ["Motor and equipment connections", "Heavy-duty power distribution", "Shutdown and emergency repair work"],
      hub: [["Safety Standards", "Rigorous lockout and safe-work practices."], ["Reliable Power", "Systems built to run hard, day after day."], ["Rapid Response", "24/7 emergency availability when production stops."]] },
    { id: "panel-upgrades", name: "Panel Upgrades", img: "panel.jpg", short: "Upgrade your electrical panel for more capacity and better safety.",
      why: "Frequent breaker trips, flickering lights, or adding new appliances? An outdated panel may be the cause. We upgrade panels to handle today's demands safely.",
      perks: ["100A to 200A service upgrades", "Breaker and sub-panel replacement", "Aluminum and outdated panel replacement"],
      hub: [["Signs You Need One", "Tripping breakers, buzzing, or a panel older than 30 years."], ["Capacity for Growth", "Room for EV chargers, heat pumps, and renovations."], ["Fully Permitted", "Work is done to code and inspected."]] },
    { id: "lighting", name: "Lighting Solutions", img: "board.jpg", short: "Interior, exterior, and energy-efficient lighting designed for you.",
      why: "Good lighting changes how a space looks and feels. We install pot lights, fixtures, outdoor lighting, and efficient LED upgrades that cut your energy bill.",
      perks: ["Pot lights and LED retrofits", "Indoor and outdoor fixtures", "Dimmers and smart controls"],
      hub: [["Energy Efficient", "LED upgrades that lower your costs."], ["Custom Layouts", "Lighting planned around your space."], ["Smart Controls", "Dimmers, timers, and app-controlled options."]] },
    { id: "troubleshooting", name: "Troubleshooting & Repairs", img: "meter.jpg", short: "Fast diagnosis and repair of faults, outages, and failing circuits.",
      why: "Dead outlets, tripping breakers, or burning smells need attention right away. Voltera Plus tracks down the cause and fixes it correctly the first time.",
      perks: ["Fault finding and diagnostics", "Outage and breaker issues", "24/7 emergency service"],
      hub: [["Accurate Diagnosis", "Proper testing to find the real cause."], ["Fixed Right", "Repairs that last, not quick patches."], ["Available 24/7", "Emergency service when you need us."]] },
  ];

  const REVIEWS = [
    ["Great value for money!", "Fair pricing and excellent quality work. The new panel was installed quickly and the whole job came in on budget.", "Olivia M.", "Homeowner"],
    ["Reliable and efficient!", "Abe arrived on time, found the fault fast, and had our power back on the same day.", "Michael C.", "Property Manager"],
    ["Exceptional emergency service!", "We had an outage late at night and he answered right away. Truly 24/7 service.", "Sophia T.", "Restaurant Owner"],
    ["Professional and friendly!", "Explained everything clearly, kept the site tidy, and the lighting looks fantastic.", "Ethan S.", "Homeowner"],
    ["Thorough and meticulous!", "Every wire was labeled and every detail was checked. Great workmanship.", "Emma J.", "Office Manager"],
    ["Fast and reliable service!", "Quick to respond to our quote request and scheduled around our business hours.", "Liam D.", "Shop Owner"],
    ["Outstanding attention to detail!", "Red Seal certified and it shows. The work was clean and passed inspection first time.", "Ava R.", "Homeowner"],
    ["Highly recommend!", "Honest advice and a free estimate. We will definitely call again.", "Noah B.", "Landlord"],
    ["Safe and professional!", "I felt safe having him in my home. Very professional from start to finish.", "Isabella W.", "Homeowner"],
  ];

  const POSTS = [
    { id: 1, title: "7 Signs Your Electrical Panel Needs an Upgrade", img: "panel.jpg", date: "February 10, 2026", cta: "Learn More", short: "Tripping breakers and flickering lights can mean it is time for a new panel.",
      sections: [["Why panels age", "Electrical panels do not last forever. Older panels may not cope with modern demands such as EV chargers, heat pumps, and home offices."], ["Warning signs", "Frequent tripped breakers, buzzing sounds, scorch marks, flickering lights, and warm panel covers are all reasons to call a licensed electrician."], ["Next steps", "A Red Seal electrician can assess your panel and recommend whether a repair or full upgrade is the safest choice."]] },
    { id: 2, title: "Energy-Efficient Lighting Ideas for Your Home", img: "board.jpg", date: "March 5, 2026", cta: "Discover Now", short: "Cut your power bill and brighten every room with LED lighting.",
      sections: [["Switch to LED", "LED fixtures use far less electricity and last many times longer than traditional bulbs."], ["Layer your lighting", "Combine ambient, task, and accent lighting for a space that is both useful and inviting."], ["Add controls", "Dimmers and timers let you adjust brightness and save even more."]] },
    { id: 3, title: "What To Do During a Power Outage", img: "meter.jpg", date: "April 20, 2026", cta: "Read More", short: "Simple steps to stay safe when the lights go out.",
      sections: [["Check the basics", "Look at your breakers first. If neighbours have power, the issue is likely inside your home."], ["Stay safe", "Never touch downed lines and avoid using generators indoors."], ["When to call", "If a breaker keeps tripping or you smell burning, call an electrician right away."]] },
    { id: 4, title: "Choosing the Right Electrician for Your Project", img: "hero.jpg", date: "May 15, 2026", cta: "Find Out More", short: "Why Red Seal certification and proper licensing matter.",
      sections: [["Check credentials", "Look for a licensed electrician with Red Seal certification, which is a national standard of excellence."], ["Ask for estimates", "A professional will provide clear written quotes."], ["Look for service", "Responsive communication is a good sign of reliable work."]] },
    { id: 5, title: "Preparing Your Business for an Electrical Upgrade", img: "blueprint.jpg", date: "June 2, 2026", cta: "Get Started", short: "Plan ahead to keep downtime low and costs under control.",
      sections: [["Plan the scope", "Start with a clear list of your power needs now and in the future."], ["Schedule smartly", "Work after hours or in phases reduces disruption."], ["Permits and inspections", "Your electrician should handle both so you stay compliant."]] },
    { id: 6, title: "EV Charger Installation: What You Need to Know", img: "house.jpg", date: "July 10, 2026", cta: "Learn How", short: "Is your home ready for a Level 2 charger?",
      sections: [["Check capacity", "A Level 2 charger needs a dedicated circuit, and your panel must have the capacity."], ["Location matters", "The closer the charger is to the panel, the simpler the install."], ["Permits", "A licensed electrician handles the permit and inspection."]] },
    { id: 7, title: "Home Electrical Safety Checklist", img: "solder.jpg", date: "September 12, 2026", cta: "Discover Solutions", short: "Quick checks every homeowner should do each year.",
      sections: [["Test your GFCIs", "Press the test and reset buttons monthly on bathroom, kitchen, and outdoor outlets."], ["Inspect cords", "Replace anything frayed or damaged."], ["Do not overload", "Avoid daisy-chaining power bars and extension cords."]] },
    { id: 8, title: "Winter Electrical Tips for Ottawa Homes", img: "house.jpg", date: "October 18, 2026", cta: "Prepare Now", short: "Get your home ready for cold months and heavy heating loads.",
      sections: [["Heating loads", "Space heaters and block heaters can overload circuits. Use dedicated, rated outlets."], ["Outdoor safety", "Check outdoor lights and outlets for weather damage before winter."], ["Backup plan", "Know where your panel is and have a trusted electrician on call."]] },
    { id: 9, title: "Why Regular Electrical Inspections Matter", img: "electrician.jpg", date: "December 1, 2026", cta: "Learn More", short: "Catch hidden problems before they become expensive hazards.",
      sections: [["Hidden issues", "Loose connections and worn wiring often cause problems you cannot see."], ["Peace of mind", "An inspection confirms your system is safe and up to date."], ["Before you buy", "Inspect a property before purchasing to avoid surprises."]] },
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const img = (n) => `images/${n}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const param = (k) => new URLSearchParams(location.search).get(k);
  const page = document.body.dataset.page || "";

  // header & footer
  const nav = (p, label, href) => `<a href="${href}" class="${page === p ? "active" : ""}">${label}</a>`;
  const header = $("#site-header");
  if (header) header.outerHTML = `
  <header class="site-header"><div class="container nav">
    <a href="index.html" class="brand"><img src="${img("logo-mark.png")}" alt="Voltera Plus logo">VOLT<span style='margin-left:-8px'>ERA</span><small>PLUS</small></a>
    <nav class="nav-links" id="navLinks">
      ${nav("home", "Home", "index.html")}${nav("about", "About", "about.html")}${nav("services", "Services", "services.html")}${nav("reviews", "Reviews", "reviews.html")}${nav("blog", "Blog", "blog.html")}${nav("contact", "Contact", "contact.html")}
    </nav>
    <a href="tel:+1${SITE.phone.replace(/\D/g, "")}" class="btn btn-gold">Call ${SITE.phone}</a>
    <button class="nav-toggle" id="navToggle" aria-label="Menu">&#9776;</button>
  </div></header>`;
  $("#navToggle")?.addEventListener("click", () => $("#navLinks").classList.toggle("open"));

  const cta = $("#cta");
  if (cta) cta.outerHTML = `
  <section class="cta"><div class="txt"><h2>Your Trusted Electrician is Just One Call Away!</h2>
    <a class="btn" href="contact.html">Get a Free Estimate</a></div>
    <img class="pic" src="${img("hero.jpg")}" alt="Voltera Plus electrician" loading="lazy"></section>`;

  const footer = $("#site-footer");
  if (footer) footer.outerHTML = `
  <footer class="site-footer"><div class="container">
    <div class="foot-grid">
      <div><a href="index.html" class="brand"><img src="${img("logo-mark.png")}" alt="">VOLT<span style='margin-left:-8px'>ERA</span><small>PLUS</small></a>
        <p style="margin-top:12px">Electrical and General Contracting Services. ${SITE.tagline}</p>
        <span class="badge-247">24/7 Available</span></div>
      <div><h4>Navigation</h4><ul><li><a href="about.html">About</a></li><li><a href="reviews.html">Client Reviews</a></li><li><a href="blog.html">Blog</a></li><li><a href="contact.html">Contact</a></li></ul></div>
      <div><h4>Services</h4><ul>${SERVICES.map((s) => `<li><a href="service-details.html?id=${s.id}">${esc(s.name)}</a></li>`).join("")}</ul></div>
      <div><h4>Contact</h4><ul>
        <li>${SITE.owner}, ${SITE.title}</li>
        <li><a href="tel:+1${SITE.phone.replace(/\D/g, "")}">${SITE.phone}</a></li>
        <li><a href="mailto:${SITE.email}">${SITE.email}</a></li>
        <li>${SITE.area}</li></ul></div>
    </div>
    <div class="foot-bottom"><span>&copy; ${new Date().getFullYear()} Voltera Plus. All rights reserved.</span><span>Red Seal Certified. Free Estimates.</span></div>
  </div></footer>`;

  // renderers
  const svcCard = (s) => `<a class="svc" href="service-details.html?id=${s.id}"><img src="${img(s.img)}" alt="${esc(s.name)}" loading="lazy"><div class="label"><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p></div></a>`;
  const reviewCard = (r, cls = "") => `<div class="review ${cls}"><div class="quote">&ldquo;</div><h3>${esc(r[0])}</h3><p>${esc(r[1])}</p><div class="who"><div class="avatar">${esc(r[2][0])}</div><div><strong>${esc(r[2])}</strong><small>${esc(r[3])}</small></div></div></div>`;
  const postCard = (p) => `<a class="post" href="blog-details.html?id=${p.id}"><img src="${img(p.img)}" alt="" loading="lazy"><div class="body"><h3>${esc(p.title)}</h3><p>${esc(p.short)}</p><div class="meta"><span class="more">${esc(p.cta)} &rarr;</span><span class="date">${esc(p.date)}</span></div></div></a>`;

  $$("[data-render]").forEach((el) => {
    const [kind, n] = el.dataset.render.split(":");
    const lim = n ? +n : undefined;
    if (kind === "services") el.innerHTML = SERVICES.slice(0, lim).map(svcCard).join("");
    if (kind === "reviews") el.innerHTML = REVIEWS.slice(0, lim).map((r) => reviewCard(r, el.dataset.card || "")).join("");
    if (kind === "posts") el.innerHTML = POSTS.slice(0, lim).map(postCard).join("");
    if (kind === "svc-options") el.innerHTML = `<option value="">Select your required service</option>` + SERVICES.map((s) => `<option>${esc(s.name)}</option>`).join("") + `<option>Emergency Service</option>`;
  });

  // service details
  const sd = $("#service-detail");
  if (sd) {
    const s = SERVICES.find((x) => x.id === param("id")) || SERVICES[0];
    document.title = `${s.name} | Voltera Plus`;
    $("#sd-title").textContent = s.name;
    $("#sd-short").textContent = s.short;
    $("#sd-img").src = img(s.img);
    $("#sd-why").textContent = `Why choose Voltera Plus for ${s.name.toLowerCase()}?`;
    $("#sd-text").textContent = s.why;
    $("#sd-perks").innerHTML = s.perks.map((p) => `<li>${esc(p)}</li>`).join("");
    $("#sd-hub-img").src = img(SERVICES[(SERVICES.indexOf(s) + 1) % SERVICES.length].img);
    $("#sd-acc").innerHTML = s.hub.map((h, i) => `<div class="${i === 0 ? "open" : ""}"><button type="button">${esc(h[0])}<span>${i === 0 ? "&minus;" : "+"}</span></button><div class="panel"><p>${esc(h[1])}</p></div></div>`).join("");
    const sel = $("#sd-form select");
    if (sel) sel.value = s.name;
  }

  // blog details
  const bd = $("#blog-detail");
  if (bd) {
    const p = POSTS.find((x) => x.id === +param("id")) || POSTS[0];
    document.title = `${p.title} | Voltera Plus`;
    $("#bd-date").textContent = p.date;
    $("#bd-title").textContent = p.title;
    $("#bd-short").textContent = p.short;
    bd.innerHTML = `<img src="${img(p.img)}" alt="">` + p.sections.map((s) => `<h2>${esc(s[0])}</h2><p>${esc(s[1])}</p>`).join("");
    $("#bd-more").innerHTML = POSTS.filter((x) => x.id !== p.id).slice(0, 3).map(postCard).join("");
  }

  // accordion
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".acc button");
    if (!b) return;
    const item = b.parentElement;
    const was = item.classList.contains("open");
    $$(".acc > div").forEach((d) => { d.classList.remove("open"); $("span", d).innerHTML = "+"; });
    if (!was) { item.classList.add("open"); $("span", item).innerHTML = "&minus;"; }
  });

  // review slider-free pagination dots not needed; video placeholder
  $(".video .play")?.addEventListener("click", () => alert("Add your company video here."));

  // forms
  $$("form[data-form]").forEach((f) => {
    f.noValidate = true;
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      let ok = true;
      $$("[data-req]", f).forEach((inp) => {
        const wrap = inp.closest(".field");
        const v = inp.value.trim();
        const bad = !v || (inp.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
        wrap.classList.toggle("bad", bad);
        if (bad) ok = false;
      });
      if (!ok) return;
      const d = Object.fromEntries(new FormData(f));
      const body = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join("\n");
      const ms = $(".form-ok", f);
      if (ms) { ms.style.display = "block"; ms.textContent = "Thank you! Your email app will open to send your request. You can also call " + SITE.phone + "."; }
      location.href = `mailto:${SITE.email}?subject=${encodeURIComponent("Estimate request from website")}&body=${encodeURIComponent(body)}`;
      f.reset();
    });
  });
})();

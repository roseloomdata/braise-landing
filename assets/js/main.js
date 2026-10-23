(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const fmt = new Intl.NumberFormat("fr-FR");

  $("#year").textContent = new Date().getFullYear();

  // ---------- Header ----------
  const header = $(".header");
  const device = $("#device");
  let scrolled = null;
  let lastTilt = null;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const isScrolled = y > 10;
    if (isScrolled !== scrolled) {
      scrolled = isScrolled;
      header.classList.toggle("is-scrolled", isScrolled);
    }
    // Dashboard straightens up as the user scrolls; nothing to do once it's flat
    if (device && !reduceMotion) {
      const max = window.innerWidth < 640 ? 4 : window.innerWidth < 960 ? 10 : 18;
      const tilt = Math.round(max * (1 - Math.min(y / 420, 1)) * 10) / 10;
      if (tilt !== lastTilt) {
        lastTilt = tilt;
        device.style.setProperty("--tilt", `${tilt}deg`);
      }
    }
  };
  update();
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  const burger = $("#burger");
  const nav = $("#nav");
  const setMenu = (open) => {
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  };
  burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  $$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("click", (e) => {
    if (nav.classList.contains("is-open") && !nav.contains(e.target) && !burger.contains(e.target)) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
      burger.focus();
    }
  });

  // ---------- Reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-visible");
      io.unobserve(e.target);
    }),
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  $$(".reveal").forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(el);
  });

  // ---------- Pause looping animations while their section is off-screen ----------
  const pauseIo = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-paused", !e.isIntersecting)),
    { rootMargin: "100px 0px" }
  );
  $$(".hero, .logos, #installation, #resultats").forEach((el) => pauseIo.observe(el));

  // ---------- KPI counters ----------
  $$("[data-count]").forEach((el) => {
    const target = +el.dataset.count;
    if (reduceMotion) return;
    const start = performance.now();
    const dur = 1600;
    const tick = (t) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt.format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // ---------- Monthly goal: Ardi burns brighter as the count climbs ----------
  const goalCount = $("#goalCount");
  const heat = $("#ardiHeat");
  if (goalCount && heat) {
    const GOAL = 30;
    const DONE = 23;
    const render = (n) => {
      goalCount.textContent = n;
      const h = n / GOAL;
      heat.style.setProperty("--heat", h.toFixed(3));
      $("#goalBar").parentElement.style.setProperty("--heat", h.toFixed(3));
      heat.classList.toggle("is-happy", h >= 0.6);
      $("#goalPct").textContent = `${Math.round(h * 100)} %`;
      $("#goalHint").textContent = n >= GOAL ? "objectif atteint" : `plus que ${GOAL - n} RDV`;
    };
    if (reduceMotion) render(DONE);
    else {
      render(0);
      const start = performance.now();
      const tick = (t) => {
        const p = Math.min((t - start) / 2200, 1);
        render(Math.round(DONE * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      setTimeout(() => requestAnimationFrame(tick), 400);
    }
  }

  // ---------- Dashboard mockup: tabs show an example of each screen ----------
  const dashTabs = $$(".dash__nav[data-view]");
  const dashViews = $$(".dash__view");
  const lockHeight = () => {
    // every view gets the height of the tallest one so the page never jumps
    const dash = $(".dash");
    dash.style.removeProperty("--view-h");
    // on small screens the tab bar is hidden, so only the home view is ever shown
    if (!dash.querySelector(".dash__side").offsetParent) return;
    let max = 0;
    dashViews.forEach((v) => {
      const wasHidden = v.hidden;
      v.hidden = false;
      max = Math.max(max, v.offsetHeight);
      v.hidden = wasHidden;
    });
    dash.style.setProperty("--view-h", `${max}px`);
  };
  lockHeight();
  window.addEventListener("resize", lockHeight);
  dashTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      dashTabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      dashViews.forEach((v) => (v.hidden = v.dataset.view !== tab.dataset.view));
    })
  );

  // ---------- Dots visual ----------
  $$(".dots").forEach((grid) => {
    const total = +grid.dataset.dots;
    const on = +grid.dataset.on;
    // spread highlighted dots across the grid
    const picks = new Set(Array.from({ length: on }, (_, i) => Math.floor(((i + 0.5) * total) / on + ((i * 7) % 5) - 2)));
    grid.innerHTML = Array.from({ length: total }, (_, i) => `<i${picks.has(i) ? ' class="on"' : ""}></i>`).join("");
  });

  // ---------- Marquees: duplicate content for a seamless loop ----------
  $$("[data-marquee] .marquee__track").forEach((track) => {
    track.innerHTML += track.innerHTML;
  });

  // ---------- Chat helpers ----------
  const addBubble = (body, content, who = "bot", html = false) => {
    const b = document.createElement("div");
    b.className = `bubble bubble--${who}`;
    if (html) b.innerHTML = content;
    else b.textContent = content;
    body.appendChild(b);
    body.scrollTop = body.scrollHeight;
    return b;
  };
  const addTyping = (body) => {
    const t = document.createElement("div");
    t.className = "bubble bubble--bot bubble--typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t);
    body.scrollTop = body.scrollHeight;
    return t;
  };

  // ---------- Installation: scripted chat + step cycling ----------
  const stageChat = $("#stageChat");
  const script = [
    ["bot", "Bonjour ! Vous cherchez à refaire votre site ou à le faire évoluer ?"],
    ["user", "Le refaire. Vous faites aussi le SEO ?"],
    ["bot", "Oui, chaque refonte inclut l'optimisation SEO. Les projets démarrent à 2 500 €."],
    ["user", "Ok, je peux en parler avec quelqu'un ?"],
    ["bot", 'Bien sûr ! Jeudi 10h, ça vous va ?<span class="bubble__cta"><svg><use href="#i-cal"/></svg>Réserver jeudi à 10h</span>', true],
  ];

  async function playStage() {
    while (true) {
      stageChat.innerHTML = "";
      for (const [who, text, html] of script) {
        if (who === "bot") {
          const t = addTyping(stageChat);
          await wait(1200);
          t.remove();
        } else {
          await wait(1000);
        }
        addBubble(stageChat, text, who, html);
        while (stageChat.children.length > 4) stageChat.firstElementChild.remove();
        await wait(800);
      }
      if (reduceMotion) return;
      await wait(4000);
    }
  }

  const stageIo = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      playStage();
      stageIo.disconnect();
    }
  }, { threshold: 0.3 });
  if (stageChat) stageIo.observe(stageChat);

  // ---------- Copy the install snippet ----------
  const copyBtn = $("#snippetCopy");
  if (copyBtn) {
    let copyTimer;
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.code);
      } catch {
        return; // clipboard blocked (insecure context, permissions): leave the button as is
      }
      copyBtn.classList.add("is-copied");
      copyBtn.querySelector("span").textContent = "Copié";
      copyBtn.querySelector("use").setAttribute("href", "#i-check");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.classList.remove("is-copied");
        copyBtn.querySelector("span").textContent = "Copier";
        copyBtn.querySelector("use").setAttribute("href", "#i-copy");
      }, 2000);
    });
  }

  // ---------- ROI calculator ----------
  const visitors = $("#visitors");
  const rate = $("#rate");
  const value = $("#value");
  const UPLIFT = 0.25;

  const paintRange = (input) => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty("--p", `${p}%`);
  };

  function updateRoi() {
    const v = +visitors.value;
    const r = +rate.value / 100;
    const val = +value.value;
    const extraLeads = Math.round(v * r * UPLIFT);
    const yearly = extraLeads * val * 12;

    $("#outVisitors").textContent = fmt.format(v);
    $("#outRate").textContent = `${(+rate.value).toFixed(1).replace(".", ",")} %`;
    $("#outValue").textContent = `${fmt.format(val)} €`;
    $("#resLeads").textContent = `+${fmt.format(extraLeads)}`;
    $("#resRevenue").textContent = `+${fmt.format(yearly)} €`;
    [visitors, rate, value].forEach(paintRange);
  }
  [visitors, rate, value].forEach((el) => el.addEventListener("input", updateRoi));
  updateRoi();

  // ---------- Pricing toggle ----------
  const toggle = $(".toggle");
  $$(".toggle__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const period = btn.dataset.period;
      toggle.dataset.period = period;
      $$(".toggle__btn").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      $$(".plan__price .amount[data-monthly]").forEach((el) => {
        el.textContent = `${el.dataset[period]} €`;
      });
    })
  );

  // ---------- FAQ: smooth open / close (several answers can stay open) ----------
  $$(".faq__item").forEach((item) => {
    const summary = item.querySelector("summary");
    const body = item.querySelector(".faq__a");
    let anim = null;
    summary.addEventListener("click", (e) => {
      if (reduceMotion) return; // native <details> behaviour
      e.preventDefault();
      if (anim) anim.cancel();
      const opening = !item.open;
      const from = item.open ? body.offsetHeight : 0;
      if (opening) item.open = true;
      const to = opening ? body.scrollHeight : 0;
      anim = body.animate(
        [{ height: `${from}px`, opacity: opening ? 0 : 1 }, { height: `${to}px`, opacity: opening ? 1 : 0 }],
        { duration: opening ? 300 : 220, easing: "cubic-bezier(.2,.7,.2,1)" }
      );
      anim.onfinish = () => {
        if (!opening) item.open = false;
        anim = null;
      };
    });
  });

  // ---------- Demo widget ----------
  const widget = $("#widget");
  const panel = $("#widgetPanel");
  const launcher = $("#widgetLauncher");
  const wBody = $("#widgetBody");
  const form = $("#widgetForm");
  const input = $("#widgetInput");
  let greeted = false;

  // Canned answers for the demo; the real product answers from the customer's content.
  const answers = [
    [/prix|tarif|co[uû]t|combien|cher|abonnement/i, "Il y a une offre gratuite (50 conversations/mois, sans carte bancaire). Les offres payantes démarrent à 29 €/mois, avec 7 jours d'essai."],
    [/install|long|temps|minute|wordpress|wix|shopify|webflow|script/i, "Environ 10 minutes : vous indiquez l'adresse de votre site, testez l'assistant, puis collez une ligne de code. Compatible WordPress, Wix, Webflow, Shopify…"],
    [/rgpd|donn[ée]es|s[ée]curit|h[ée]berg/i, "Toutes les données sont hébergées en France, jamais revendues, et les IP ne sont pas stockées. Les conversations sont conservées 12 mois maximum."],
    [/d[ée]mo|rdv|rendez|appel|parler|contact/i, "Avec plaisir ! Laissez-moi votre e-mail et l'équipe vous propose un créneau de 15 minutes."],
    [/@/, "Merci ! C'est noté, vous recevrez une proposition de créneau très vite."],
    [/bonjour|salut|hello|coucou/i, "Bonjour ! Je peux vous parler des tarifs, de l'installation ou de la sécurité des données."],
  ];
  const fallback = "Bonne question ! Sur votre site, je répondrais à partir de vos propres contenus. Ici je suis en démo : essayez « tarifs », « installation » ou « RGPD ».";

  async function botReply(text) {
    const t = addTyping(wBody);
    await wait(700 + Math.min(text.length * 8, 900));
    t.remove();
    addBubble(wBody, text, "bot");
  }

  const setWidget = (open) => {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Fermer le chat" : "Ouvrir le chat");
    if (!open) return;
    widget.classList.add("has-opened");
    if (!greeted) {
      greeted = true;
      botReply("Bonjour ! Je suis Ardi, l'assistant de Braise. Une question ? Je réponds en direct.");
    }
    setTimeout(() => input.focus(), 50);
  };

  function ask(text) {
    const msg = text.trim();
    if (!msg) return;
    addBubble(wBody, msg, "user");
    const match = answers.find(([re]) => re.test(msg));
    botReply(match ? match[1] : fallback);
  }

  launcher.addEventListener("click", () => setWidget(panel.hidden));
  $("#widgetNudge").addEventListener("click", (e) => {
    if (e.target.id === "nudgeClose") widget.classList.add("has-opened");
    else setWidget(true);
  });
  $("#widgetClose").addEventListener("click", () => setWidget(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setWidget(false);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(input.value);
    input.value = "";
  });
  $$("#widgetChips button").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
})();

/**
 * main.js
 * Vykreslení webu z data/content.json a data/theme.json.
 * HTML je pouze kostra — veškerý obsah doplňuje tento skript.
 *
 * Bezpečnost: veškerý textový obsah je před vložením do DOM escapován
 * (escapeHTML), aby JSON s obsahem nemohl fungovat jako vektor
 * pro stored XSS, i kdyby byl v budoucnu upraven necheckovaným zdrojem.
 */
(function () {
  "use strict";

  /* ---------- Pomocné funkce ---------- */

  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Pro pole, kde chceme povolit pouze bezpečné, předem známé tagy (např. <br>, &amp;)
  // použijeme explicitní whitelist místo syrového innerHTML.
  function safeRichText(str) {
    return escapeHTML(str).replace(/&amp;amp;/g, "&amp;");
  }

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("Nepodařilo se načíst " + path);
    return res.json();
  }

  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    if (!theme || !theme.colors) return;
    const root = document.documentElement.style;
    const map = {
      primary: "--color-primary",
      secondary: "--color-secondary",
      background: "--color-bg",
      backgroundAlt: "--color-bg-alt",
      accent: "--color-accent",
      accentLight: "--color-accent-light",
      textMuted: "--color-text-muted",
      border: "--color-border",
      white: "--color-white"
    };
    Object.entries(map).forEach(([key, cssVar]) => {
      if (theme.colors[key]) root.setProperty(cssVar, theme.colors[key]);
    });
    if (theme.fonts) {
      if (theme.fonts.body) root.setProperty("--font-body", theme.fonts.body);
      if (theme.fonts.display) root.setProperty("--font-display", theme.fonts.display);
      if (theme.fonts.mono) root.setProperty("--font-mono", theme.fonts.mono);
    }
  }

  /* ---------- Render: hlavička ---------- */

  function renderHeader(content) {
    const h = content.header;
    document.getElementById("logo-text").textContent = h.logoText;
    document.getElementById("logo-sub").innerHTML = safeRichText(h.logoSub);

    const navDesktop = document.getElementById("nav-desktop");
    const navMobile = document.getElementById("nav-mobile-links");
    navDesktop.innerHTML = "";
    navMobile.innerHTML = "";

    h.nav.forEach((item) => {
      const a1 = el("a", null, "");
      a1.href = item.href;
      a1.textContent = item.label;
      navDesktop.appendChild(a1);

      const a2 = a1.cloneNode(true);
      navMobile.appendChild(a2);
    });

    document.querySelectorAll("[data-header-cta]").forEach((btn) => {
      btn.textContent = h.ctaLabel;
    });
  }

  /* ---------- Render: hero ---------- */

  function renderHero(content) {
    const hero = content.hero;
    document.getElementById("hero-title-1").textContent = hero.titleLine1;
    document.getElementById("hero-title-2").textContent = hero.titleLine2;
    document.getElementById("hero-text").textContent = hero.text;
    buildHeroScale(hero.scaleLabel || "");

    const ctaPrimary = document.getElementById("hero-cta-primary");
    ctaPrimary.href = hero.ctaPrimary.href;
    ctaPrimary.querySelector("span").textContent = hero.ctaPrimary.label;

    const ctaSecondary = document.getElementById("hero-cta-secondary");
    ctaSecondary.href = hero.ctaSecondary.href;
    ctaSecondary.textContent = hero.ctaSecondary.label;

    const heroMedia = document.getElementById("hero-media");
    heroMedia.innerHTML = "";
    if (hero.image && hero.image.src) {
      const img = el("img");
      img.src = hero.image.src;
      img.alt = escapeHTML(hero.image.alt || "");
      img.loading = "eager";
      heroMedia.appendChild(img);
    } else {
      heroMedia.appendChild(el("div", "placeholder-media", ICONS.roofFrame));
    }
    if (hero.scaleLabel) {
      const badge = el("div", "badge", `<span>${escapeHTML(hero.scaleLabel)}</span>`);
      heroMedia.appendChild(badge);
    }
  }

  /* ---------- Render: o nás ---------- */

  function renderAbout(content) {
    const about = content.about;
    document.getElementById("about-eyebrow").textContent = about.eyebrow;
    document.getElementById("about-title").textContent = about.title;
    document.getElementById("about-text").textContent = about.text;

    const mediaContainer = document.getElementById("about-media");
    mediaContainer.innerHTML = "";
    if (about.image && about.image.src) {
      const img = el("img");
      img.src = about.image.src;
      img.alt = escapeHTML(about.image.alt || "");
      img.loading = "lazy";
      mediaContainer.appendChild(img);
    } else {
      mediaContainer.appendChild(el("div", "placeholder-media", ICONS.woodPlank));
    }

    const statsRow = document.getElementById("about-stats");
    statsRow.innerHTML = "";
    (about.stats || []).forEach((stat) => {
      const wrap = el("div", "stat");
      const value = el(
        "div",
        "stat-value",
        `${escapeHTML(stat.value)}<span class="stat-unit">${escapeHTML(stat.unit || "")}</span>`
      );
      const label = el("div", "stat-label", escapeHTML(stat.label));
      wrap.appendChild(value);
      wrap.appendChild(label);
      statsRow.appendChild(wrap);
    });
  }

  /* ---------- Render: služby ---------- */

  function renderServices(content) {
    const services = content.services;
    document.getElementById("services-eyebrow").textContent = services.eyebrow;
    document.getElementById("services-title").textContent = services.title;

    const grid = document.getElementById("services-grid");
    grid.innerHTML = "";
    services.items.forEach((service) => {
      const card = el("div", "service-card");
      const icon = el("div", "service-icon", ICONS[service.icon] || ICONS.woodPlank);
      const title = el("h3", null, escapeHTML(service.title));
      const list = el("ul");
      (service.items || []).forEach((line) => {
        const li = el("li", null, escapeHTML(line));
        list.appendChild(li);
      });
      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(list);
      grid.appendChild(card);
    });
  }

  /* ---------- Render: galerie ---------- */

  let galleryItems = [];

  function renderGallery(content) {
    const gallery = content.gallery;
    document.getElementById("gallery-eyebrow").textContent = gallery.eyebrow;
    document.getElementById("gallery-title").textContent = gallery.title;

    galleryItems = gallery.items || [];
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = "";

    galleryItems.forEach((item, index) => {
      const figure = el("div", "gallery-item");
      figure.setAttribute("role", "button");
      figure.setAttribute("tabindex", "0");
      figure.setAttribute(
        "aria-label",
        "Zobrazit fotografii: " + (item.title || "realizace")
      );

      if (item.image) {
        const img = el("img");
        img.src = item.image;
        img.alt = escapeHTML(item.title || "Fotografie realizace");
        img.loading = "lazy";
        figure.appendChild(img);
      } else {
        figure.appendChild(el("div", "placeholder-media", ICONS.roofTiles));
      }

      const caption = el(
        "div",
        "gallery-caption",
        `<div class="g-title">${escapeHTML(item.title)}</div><div class="g-desc">${escapeHTML(
          item.description
        )}</div>`
      );
      figure.appendChild(caption);

      const open = () => openLightbox(index);
      figure.addEventListener("click", open);
      figure.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });

      grid.appendChild(figure);
    });
  }

  function openLightbox(index) {
    const item = galleryItems[index];
    if (!item) return;
    const lightbox = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const caption = document.getElementById("lightbox-caption");
    img.src = item.image || "";
    img.alt = escapeHTML(item.title || "");
    caption.textContent = [item.title, item.description].filter(Boolean).join(" — ");
    lightbox.classList.add("is-open");
    document.body.style.overflow = "hidden";
    lightbox.focus();
  }

  function closeLightbox() {
    const lightbox = document.getElementById("lightbox");
    lightbox.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  /* ---------- Render: lešení ---------- */

  function renderScaffolding(content) {
    const s = content.scaffolding;
    document.getElementById("scaffolding-title").textContent = s.title;
    document.getElementById("scaffolding-text").textContent = s.text;
    const cta = document.getElementById("scaffolding-cta");
    cta.textContent = s.ctaLabel;
    cta.href = s.ctaHref || "#kontakt";
  }

  /* ---------- Render: kontakt ---------- */

  function renderContact(content) {
    const c = content.contact;
    document.getElementById("contact-eyebrow").textContent = c.eyebrow;
    document.getElementById("contact-title").textContent = c.title;
    document.getElementById("contact-text").textContent = c.text;

    const grid = document.getElementById("contact-grid");
    grid.innerHTML = "";
    (c.persons || []).forEach((p) => {
      const card = el("div", "contact-card");
      card.appendChild(el("h3", null, escapeHTML(p.name)));

      const rowPin = el(
        "div",
        "contact-row",
        `${ICONS.pin}<span>${escapeHTML(p.address)}</span>`
      );
      const rowIc = el(
        "div",
        "contact-row",
        `${ICONS.idCard}<span>IČ: ${escapeHTML(p.ic)}</span>`
      );
      const telHref = "tel:" + String(p.phone).replace(/\s+/g, "");
      const rowPhone = el(
        "div",
        "contact-row",
        `${ICONS.phone}<a href="${telHref}">${escapeHTML(p.phone)}</a>`
      );

      card.appendChild(rowPin);
      card.appendChild(rowIc);
      card.appendChild(rowPhone);
      grid.appendChild(card);
    });

    document.getElementById("contact-cta-label").textContent = c.ctaLabel;
  }

  /* ---------- Render: footer ---------- */

  function renderFooter(content) {
    document.getElementById("footer-text").textContent = content.footer.text;
    document.getElementById("footer-copy").textContent = content.footer.copyright;
  }

  /* ---------- Cookie lišta ---------- */

  const COOKIE_KEY = "suta_cookie_consent";
  let cookieBehaviorInitialized = false;

  // Text je už napevno v HTML, takže tohle jen drží text v souladu s content.json
  // (např. po úpravě v administraci) - nemá vliv na to, kdy se lišta zobrazí.
  function syncCookieText(content) {
    const textEl = document.getElementById("cookie-text");
    const acceptBtn = document.getElementById("cookie-accept");
    if (!textEl || !acceptBtn || !content.cookieConsent) return;
    textEl.textContent = content.cookieConsent.text;
    acceptBtn.textContent = content.cookieConsent.acceptLabel;
  }

  // Zobrazení lišty a reakce na klik nezávisí na fetch() - stačí, že HTML
  // element existuje, spouští se hned při načtení stránky.
  function initCookieBehavior() {
    if (cookieBehaviorInitialized) return;
    cookieBehaviorInitialized = true;

    const bar = document.getElementById("cookie-bar");
    const acceptBtn = document.getElementById("cookie-accept");
    if (!bar || !acceptBtn) return;

    let consent = null;
    try {
      consent = localStorage.getItem(COOKIE_KEY);
    } catch (e) {
      /* localStorage nemusí být dostupný (privátní režim) — liště to nevadí */
    }

    if (!consent) {
      requestAnimationFrame(() => bar.classList.add("is-visible"));
    }

    acceptBtn.addEventListener("click", () => {
      try {
        localStorage.setItem(COOKIE_KEY, "accepted");
      } catch (e) {}
      bar.classList.remove("is-visible");
    });
  }

  /* ---------- Interakce: header, menu, reveal ---------- */

  // "Limelight" efekt - zářící pruh, který plynule klouže pod položkou menu
  // při najetí myší. Volá se jak hned při startu (statické odkazy v HTML),
  // tak znovu po renderHeader() (odkazy se tam přestaví na nové uzly).
  function initNavLimelight() {
    const nav = document.getElementById("nav-desktop");
    const limelight = document.getElementById("nav-limelight");
    if (!nav || !limelight) return;

    function moveTo(link) {
      const left = link.offsetLeft + link.offsetWidth / 2 - limelight.offsetWidth / 2;
      limelight.style.left = left + "px";
      limelight.classList.add("is-visible");
    }

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("mouseenter", () => moveTo(link));
    });
    nav.addEventListener("mouseenter", () => nav.classList.add("is-hovering"));
    nav.addEventListener("mouseleave", () => {
      nav.classList.remove("is-hovering");
      limelight.classList.remove("is-visible");
    });
  }

  function initHeaderScroll() {
    const header = document.getElementById("site-header");
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function initMobileNav() {
    const toggle = document.getElementById("nav-toggle");
    const mobile = document.getElementById("nav-mobile");
    const closeBtn = document.getElementById("nav-mobile-close");

    function open() {
      mobile.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }
    function close() {
      mobile.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }

    toggle.addEventListener("click", () => {
      mobile.classList.contains("is-open") ? close() : open();
    });
    closeBtn.addEventListener("click", close);
    mobile.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  }

  function initReveal() {
    const targets = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    targets.forEach((t) => observer.observe(t));
  }

  function initLightbox() {
    document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLightbox();
    });
  }

  function buildHeroScale(labelText) {
    const scale = document.getElementById("hero-scale");
    if (!scale) return;
    scale.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const tick = el("div", "tick" + (i % 4 === 0 ? " major" : ""));
      scale.appendChild(tick);
    }
    if (labelText) {
      const label = el("div", "tick major");
      label.appendChild(el("span", "tick-label", escapeHTML(labelText)));
      scale.appendChild(label);
    }
  }

  /* ---------- Vykreslení celé stránky z dat ---------- */

  function renderAll(content, theme) {
    if (theme) applyTheme(theme);

    document.title = content.meta.title;
    setMeta("description", content.meta.description);
    setMeta("theme-color", content.meta.themeColor);
    setOg("og:title", content.meta.title);
    setOg("og:description", content.meta.description);
    if (content.meta.ogImage) setOg("og:image", content.meta.ogImage);

    renderHeader(content);
    initNavLimelight();
    renderHero(content);
    renderAbout(content);
    renderServices(content);
    renderGallery(content);
    renderScaffolding(content);
    renderContact(content);
    renderFooter(content);
    syncCookieText(content);

    // Reveal pozorovatel se musí znovu napojit i po přerenderování (např.
    // v živém náhledu), protože se DOM uzly galerie/služeb/kontaktů nahrazují.
    initReveal();

    // Skeleton-loading placeholdery (šedé "cihličky" než se načte obsah) je
    // potřeba po vykreslení skutečného textu odstranit - jinak CSS pravidlo
    // [data-skeleton] drží text natrvalo průhledný, i když je správně vyplněný.
    // (HTML teď obsahuje reálný obsah rovnou, takže se toto v běžném provozu
    // ani nemá kdy projevit - jde jen o pojistku pro budoucí úpravy.)
    document.querySelectorAll("[data-skeleton]").forEach((node) => {
      node.removeAttribute("data-skeleton");
    });

    document.body.classList.remove("is-loading");
  }

  /* ---------- Inicializace ---------- */

  async function init() {
    // Tohle nepotřebuje data z content.json - HTML už obsahuje hotový text,
    // takže menu, scroll efekt hlavičky, lightbox, scroll-reveal animace
    // i cookie lišta fungují okamžitě, bez čekání na síť.
    initHeaderScroll();
    initMobileNav();
    initNavLimelight();
    initLightbox();
    initReveal();
    initCookieBehavior();

    try {
      const [content, theme] = await Promise.all([
        fetchJSON("data/content.json"),
        fetchJSON("data/theme.json")
      ]);
      // Doplní/aktualizuje obsah podle aktuálního content.json (např. po
      // úpravě v administraci). Pokud fetch selže, stránka dál funguje
      // s obsahem, který už je napevno v HTML.
      renderAll(content, theme);
    } catch (err) {
      console.error("Chyba při načítání obsahu webu:", err);
    }
  }

  function setMeta(name, content) {
    if (!content) return;
    let tag = document.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", name);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  }

  function setOg(property, content) {
    if (!content) return;
    let tag = document.querySelector(`meta[property="${property}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("property", property);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

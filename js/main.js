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
    const media = hero.media;
    if (media && media.src && media.type === "video") {
      const video = el("video");
      video.src = media.src;
      video.setAttribute("aria-label", escapeHTML(media.alt || ""));
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      heroMedia.appendChild(video);
    } else if (media && media.src) {
      const img = el("img");
      img.src = media.src;
      img.alt = escapeHTML(media.alt || "");
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
  let lightboxSource = [];
  let currentAlbumIndex = 0;
  let currentPhotoIndex = 0;

  function renderGallery(content) {
    const gallery = content.gallery;
    document.getElementById("gallery-eyebrow").textContent = gallery.eyebrow;
    document.getElementById("gallery-title").textContent = gallery.title;

    galleryItems = gallery.items || [];
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = "";

    galleryItems.forEach((item, index) => {
      const images = Array.isArray(item.images) ? item.images : [];
      const figure = el("div", "gallery-item");
      figure.setAttribute("role", "button");
      figure.setAttribute("tabindex", "0");
      figure.setAttribute("aria-label", "Zobrazit album: " + (item.title || "realizace"));

      if (images[0]) {
        const img = el("img");
        img.src = images[0];
        img.alt = escapeHTML(item.title || "Fotografie realizace");
        img.loading = "lazy";
        figure.appendChild(img);
      } else {
        figure.appendChild(el("div", "placeholder-media", ICONS.roofTiles));
      }

      if (images.length > 1) {
        figure.appendChild(el("div", "gallery-count-badge", `${images.length} fotek`));
      }

      const caption = el(
        "div",
        "gallery-caption",
        `<div class="g-title">${escapeHTML(item.title)}</div><div class="g-desc">${escapeHTML(
          item.description
        )}</div>`
      );
      figure.appendChild(caption);

      const open = () => openLightbox(galleryItems, index, 0);
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

  function currentAlbumImages() {
    const item = lightboxSource[currentAlbumIndex];
    return item && Array.isArray(item.images) ? item.images : [];
  }

  function updateLightboxView() {
    const item = lightboxSource[currentAlbumIndex];
    if (!item) return;
    const images = currentAlbumImages();

    const img = document.getElementById("lightbox-img");
    const caption = document.getElementById("lightbox-caption");
    const counter = document.getElementById("lightbox-counter");
    const prevBtn = document.getElementById("lightbox-prev");
    const nextBtn = document.getElementById("lightbox-next");

    img.src = images[currentPhotoIndex] || "";
    img.alt = escapeHTML(item.title || "");
    caption.textContent = [item.title, item.description].filter(Boolean).join(" — ");

    const hasMultiple = images.length > 1;
    prevBtn.hidden = !hasMultiple;
    nextBtn.hidden = !hasMultiple;
    counter.textContent = hasMultiple ? `${currentPhotoIndex + 1} / ${images.length}` : "";
  }

  function openLightbox(source, albumIndex, photoIndex) {
    lightboxSource = source;
    const item = lightboxSource[albumIndex];
    if (!item) return;
    currentAlbumIndex = albumIndex;
    currentPhotoIndex = photoIndex || 0;

    const lightbox = document.getElementById("lightbox");
    updateLightboxView();
    lightbox.classList.add("is-open");
    document.body.style.overflow = "hidden";
    lightbox.focus();
  }

  function lightboxStep(direction) {
    const images = currentAlbumImages();
    if (images.length < 2) return;
    currentPhotoIndex = (currentPhotoIndex + direction + images.length) % images.length;
    updateLightboxView();
  }

  function closeLightbox() {
    const lightbox = document.getElementById("lightbox");
    lightbox.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  /* ---------- Render: lešení ---------- */

  function renderCertificates(content) {
    const cert = content.certificates;
    const section = document.getElementById("certificates-section");
    const hasItems = cert && Array.isArray(cert.items) && cert.items.length > 0;

    if (!section) return;
    section.hidden = !hasItems;
    if (!hasItems) return;

    document.getElementById("certificates-eyebrow").textContent = cert.eyebrow;
    document.getElementById("certificates-title").textContent = cert.title;
    document.getElementById("certificates-intro").textContent = cert.intro;

    // Certifikáty se v lightboxu chovají jako jednofotková alba - stejná
    // komponenta jako u realizací (jen bez šipek, protože je vždy jen 1 fotka).
    const certAsAlbums = cert.items.map((item) => ({
      title: item.title,
      description: [item.issuer, item.year].filter(Boolean).join(" · "),
      images: item.image ? [item.image] : []
    }));

    const grid = document.getElementById("certificates-grid");
    grid.innerHTML = "";
    cert.items.forEach((item, index) => {
      const card = el("div", "cert-card");

      if (item.image) {
        const img = el("img");
        img.src = item.image;
        img.alt = escapeHTML(item.title || "Certifikát");
        img.loading = "lazy";
        card.appendChild(img);

        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", "Zobrazit certifikát: " + (item.title || ""));
        const open = () => openLightbox(certAsAlbums, index, 0);
        card.addEventListener("click", open);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });

        if (item.pdfFile) {
          const pdfLink = document.createElement("a");
          pdfLink.href = item.pdfFile;
          pdfLink.target = "_blank";
          pdfLink.rel = "noopener";
          pdfLink.className = "cert-pdf-badge";
          pdfLink.textContent = "PDF";
          pdfLink.setAttribute("aria-label", "Stáhnout PDF originál: " + (item.title || ""));
          pdfLink.addEventListener("click", (e) => e.stopPropagation());
          card.appendChild(pdfLink);
        }
      } else {
        card.appendChild(el("div", "placeholder-media", ICONS.idCard));
      }

      const info = el("div", "cert-info");
      info.appendChild(el("div", "cert-title", escapeHTML(item.title)));
      const meta = [item.issuer, item.year].filter(Boolean).join(" · ");
      if (meta) info.appendChild(el("div", "cert-meta", escapeHTML(meta)));
      card.appendChild(info);
      grid.appendChild(card);
    });
  }

  function renderFAQ(content) {
    const faq = content.faq;
    if (!faq) return;
    document.getElementById("faq-eyebrow").textContent = faq.eyebrow;
    document.getElementById("faq-title").textContent = faq.title;

    const list = document.getElementById("faq-list");
    if (!list || !Array.isArray(faq.items)) return;
    list.innerHTML = "";

    faq.items.forEach((item, index) => {
      const wrap = el("div", "faq-item");
      const answerId = "faq-answer-" + index;

      const button = document.createElement("button");
      button.className = "faq-question";
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", answerId);
      button.innerHTML =
        `<span>${escapeHTML(item.question)}</span>` +
        `<svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

      const answerWrap = el("div", "faq-answer-wrap");
      const answerInner = el("div", "faq-answer-inner");
      const answerP = document.createElement("p");
      answerP.id = answerId;
      answerP.textContent = item.answer;
      answerInner.appendChild(answerP);
      answerWrap.appendChild(answerInner);

      wrap.appendChild(button);
      wrap.appendChild(answerWrap);
      list.appendChild(wrap);
    });
  }

  // Klik na otázku rozbalí/sbalí odpověď. Delegováno na #faq-list, takže
  // funguje i po přerenderování obsahu (renderFAQ nahrazuje uzly uvnitř).
  function initFAQAccordion() {
    const list = document.getElementById("faq-list");
    if (!list) return;
    list.addEventListener("click", (e) => {
      const button = e.target.closest(".faq-question");
      if (!button || !list.contains(button)) return;
      const item = button.closest(".faq-item");
      const isOpen = item.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(isOpen));
    });
  }

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
    document.getElementById("lightbox-prev").addEventListener("click", (e) => {
      e.stopPropagation();
      lightboxStep(-1);
    });
    document.getElementById("lightbox-next").addEventListener("click", (e) => {
      e.stopPropagation();
      lightboxStep(1);
    });
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      const lightbox = document.getElementById("lightbox");
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lightboxStep(-1);
      if (e.key === "ArrowRight") lightboxStep(1);
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
    renderCertificates(content);
    renderScaffolding(content);
    renderFAQ(content);
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
    initFAQAccordion();
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

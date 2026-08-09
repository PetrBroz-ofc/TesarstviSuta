/**
 * site-common.js
 * Sdílená logika pro vedlejší stránky webu (ochrana-udaju.html,
 * reklamacni-rad.html, obchodni-podminky.html) - hlavička, mobilní menu,
 * "limelight" efekt v navigaci a cookie lišta. Stejné chování jako na
 * hlavní stránce (main.js), jen vytažené na jedno místo, aby se
 * nekopírovalo do každého souboru zvlášť.
 *
 * Připojeno na globální objekt SiteCommon, protože stránka je vanilla JS
 * bez modulového bundleru - jednotlivé <script> tagy sdílí jen globální
 * scope.
 */
const SiteCommon = (function () {
  "use strict";

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("Nepodařilo se načíst " + path);
    return res.json();
  }

  function renderFooter(content) {
    if (!content.footer) return;
    const textEl = document.getElementById("footer-text");
    const copyEl = document.getElementById("footer-copy");
    if (textEl) textEl.textContent = content.footer.text;
    if (copyEl) copyEl.textContent = content.footer.copyright;
  }

  /* ---------- Cookie lišta ---------- */

  const COOKIE_KEY = "suta_cookie_consent";

  function syncCookieText(content) {
    if (!content.cookieConsent) return;
    const textEl = document.getElementById("cookie-text");
    const acceptEl = document.getElementById("cookie-accept");
    if (textEl) textEl.textContent = content.cookieConsent.text;
    if (acceptEl) acceptEl.textContent = content.cookieConsent.acceptLabel;
  }

  function initCookieBehavior() {
    const bar = document.getElementById("cookie-bar");
    const acceptBtn = document.getElementById("cookie-accept");
    if (!bar || !acceptBtn) return;

    let consent = null;
    try {
      consent = localStorage.getItem(COOKIE_KEY);
    } catch (e) {
      /* localStorage nemusí být dostupný (privátní režim) */
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

  /* ---------- Hlavička, mobilní menu, limelight efekt ---------- */

  function initHeaderScroll() {
    const header = document.getElementById("site-header");
    if (!header) return;
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
    if (!toggle || !mobile) return;

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
    if (closeBtn) closeBtn.addEventListener("click", close);
    mobile.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  }

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

  /** Spustí veškerou interaktivitu, která nepotřebuje data z content.json. */
  function initInteractions() {
    initHeaderScroll();
    initMobileNav();
    initNavLimelight();
    initCookieBehavior();
  }

  /** Generické vykreslení "právní" stránky (Ochrana údajů, Reklamační řád, Obchodní podmínky). */
  function renderLegalPage(pageData) {
    if (!pageData) return;

    const titleEl = document.getElementById("legal-title");
    if (titleEl) titleEl.textContent = pageData.pageTitle;

    const introEl = document.getElementById("legal-intro");
    if (introEl) introEl.textContent = pageData.intro;

    const updatedEl = document.getElementById("legal-updated");
    if (updatedEl) updatedEl.textContent = pageData.lastUpdated;

    const contactEl = document.getElementById("legal-contact-note");
    if (contactEl) contactEl.textContent = pageData.contactNote;

    const container = document.getElementById("legal-sections");
    if (container && Array.isArray(pageData.sections)) {
      container.innerHTML = "";
      pageData.sections.forEach((s) => {
        const article = document.createElement("article");
        article.className = "legal-item";
        const h2 = document.createElement("h2");
        h2.textContent = s.heading;
        const p = document.createElement("p");
        p.textContent = s.text;
        article.appendChild(h2);
        article.appendChild(p);
        container.appendChild(article);
      });
    }
  }

  return {
    fetchJSON,
    renderFooter,
    syncCookieText,
    initInteractions,
    renderLegalPage
  };
})();

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/**
 * První test: ověří obsah SUROVÉHO HTML bez spuštění jakéhokoliv JS.
 * Tohle je přesně scénář, který dělal weby "rozbité" - dokud JS neproběhl
 * (pomalá síť, GitHub Pages, mobil), byl vidět prázdný/šedý obsah.
 * Po opravě musí být reálný text a fotky vidět v HTML samotném.
 */
function testStaticHtmlHasRealContent() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html); // BEZ runScripts - žádný main.js neběží
  const doc = dom.window.document;

  const checks = [
    ["Hero titulek je v syrovém HTML vyplněný", doc.getElementById("hero-title-1").textContent.trim().length > 0],
    ["Hero podtext je v syrovém HTML vyplněný", doc.getElementById("hero-text").textContent.trim().length > 0],
    ["Hero fotka je <img>, ne prázdný placeholder", !!doc.querySelector("#hero-media img[src]")],
    ["O nás fotka je <img>, ne prázdný placeholder", !!doc.querySelector("#about-media img[src]")],
    ["Navigace je vyplněná bez JS (7 odkazů)", doc.querySelectorAll("#nav-desktop a").length === 7],
    ["Položky služeb jsou v HTML bez JS (10)", doc.querySelectorAll(".service-list-item").length === 10],
    ["Fotky realizací jsou v HTML bez JS (4)", doc.querySelectorAll(".gallery-item img").length === 4],
    ["FAQ otázky jsou v HTML bez JS (6)", doc.querySelectorAll(".faq-item").length === 6],
    ["Žádný prvek nemá data-skeleton (skrytý text)", doc.querySelectorAll("[data-skeleton]").length === 0]
  ];

  console.log("--- Test syrového HTML (bez JS) ---");
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });
  console.log("");
  return allPassed;
}

async function run() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost:8123/index.html",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });

  const { window } = dom;

  // Mock fetch pro data/content.json a data/theme.json (main.js je volá přes fetch()).
  window.fetch = async (url) => {
    const filePath = path.join(ROOT, url.toString().replace(/^\//, ""));
    const data = fs.readFileSync(filePath, "utf8");
    return {
      ok: true,
      json: async () => JSON.parse(data),
      text: async () => data
    };
  };

  // IntersectionObserver neexistuje v jsdom - jednoduchý mock
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error || e.message));

  // icons.js a main.js spojíme a spustíme jedním window.eval(), aby sdílely
  // top-level lexické scope (main.js odkazuje na `ICONS` z icons.js) -
  // stejně jako by je sdílely dva <script> tagy v opravdovém prohlížeči.
  const iconsSrc = fs.readFileSync(path.join(ROOT, "js/icons.js"), "utf8");
  const mainSrc = fs.readFileSync(path.join(ROOT, "js/main.js"), "utf8");
  window.eval(iconsSrc + "\n;\n" + mainSrc);

  // ŽÁDNÝ ruční dispatch DOMContentLoaded - jsdom ho vystřelí přirozeně
  // (asynchronně) samo. Ruční dispatch navíc by způsobil DVOJITÉ spuštění
  // init()/renderAll() (jednou přirozeně, jednou ručně), což ve zbytku
  // testu dělalo z dřív zachycených DOM referencí zastaralé uzly.

  // Počkáme na dokončení async init() (Promise.all fetchů + vykreslení)
  await new Promise((resolve) => setTimeout(resolve, 400));

  const doc = window.document;
  const checks = [
    ["Titulek stránky nastaven", doc.title.includes("Šuta")],
    ["Hero nadpis vykreslen", doc.getElementById("hero-title-1").textContent.length > 0],
    ["Hero 2. řádek vykreslen", doc.getElementById("hero-title-2").textContent.includes("Šuta")],
    ["Nav odkazy vykresleny (7)", doc.querySelectorAll("#nav-desktop a").length === 7],
    ["Položky služeb vykresleny (10)", doc.querySelectorAll(".service-list-item").length === 10],
    ["Položky galerie vykresleny (5)", doc.querySelectorAll(".gallery-item").length === 5],
    ["Kontaktní karty vykresleny (2)", doc.querySelectorAll(".contact-card").length === 2],
    ["Patička vykreslena", doc.getElementById("footer-text").textContent.length > 0],
    ["Tělo už není is-loading", !doc.body.classList.contains("is-loading")],
    [
      "Telefon má správný tel: odkaz",
      doc.querySelector(".contact-card a[href^='tel:']")?.getAttribute("href") ===
        "tel:+420739437783"
    ],
    ["Žádné JS chyby za běhu", errors.length === 0],
    [
      "Skeleton atributy odstraněny (text není neviditelný)",
      doc.querySelectorAll("[data-skeleton]").length === 0
    ],
    ["Lightbox má šipky prev/next", !!doc.getElementById("lightbox-prev") && !!doc.getElementById("lightbox-next")],
    ["Šipky lightboxu jsou skryté (album má 1 fotku)", doc.getElementById("lightbox-prev").hidden === true],
    [
      "Sekce Certifikáty se zobrazuje (obsahuje reálné certifikáty)",
      doc.getElementById("certificates-section").hidden === false
    ]
  ];

  console.log("--- Test po spuštění main.js (s daty z content.json) ---");
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });

  // Interaktivní test lightboxu: klik na první album otevře náhled se správnou fotkou
  const firstAlbum = doc.querySelector(".gallery-item");
  firstAlbum.click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const lightbox = doc.getElementById("lightbox");
  const lightboxOpened = lightbox.classList.contains("is-open");
  console.log((lightboxOpened ? "OK  " : "FAIL") + " - Klik na album otevře lightbox");
  if (!lightboxOpened) allPassed = false;

  const lightboxImgSrc = doc.getElementById("lightbox-img").getAttribute("src");
  const firstAlbumImgSrc = firstAlbum.querySelector("img")?.getAttribute("src");
  const correctImage = lightboxImgSrc === firstAlbumImgSrc;
  console.log((correctImage ? "OK  " : "FAIL") + " - Lightbox zobrazuje správnou fotku alba");
  if (!correctImage) allPassed = false;

  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const lightboxClosed = !lightbox.classList.contains("is-open");
  console.log((lightboxClosed ? "OK  " : "FAIL") + " - Klávesa Escape zavře lightbox");
  if (!lightboxClosed) allPassed = false;

  // Interaktivní test FAQ: klik na otázku ji rozbalí, druhý klik zase sbalí
  const firstFaqQuestion = doc.querySelector(".faq-question");
  firstFaqQuestion.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const faqOpened =
    firstFaqQuestion.closest(".faq-item").classList.contains("is-open") &&
    firstFaqQuestion.getAttribute("aria-expanded") === "true";
  console.log((faqOpened ? "OK  " : "FAIL") + " - Klik na FAQ otázku ji rozbalí");
  if (!faqOpened) allPassed = false;

  firstFaqQuestion.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const faqClosed =
    !firstFaqQuestion.closest(".faq-item").classList.contains("is-open") &&
    firstFaqQuestion.getAttribute("aria-expanded") === "false";
  console.log((faqClosed ? "OK  " : "FAIL") + " - Druhý klik na stejnou otázku ji zase sbalí");
  if (!faqClosed) allPassed = false;

  if (errors.length) {
    console.log("\nZachycené chyby:");
    errors.forEach((e) => console.log(" -", e && e.stack ? e.stack : e));
  }

  return allPassed;
}

(async () => {
  const staticOk = testStaticHtmlHasRealContent();
  const renderOk = await run();
  process.exit(staticOk && renderOk ? 0 : 1);
})().catch((err) => {
  console.error("Test selhal s výjimkou:", err);
  process.exit(1);
});

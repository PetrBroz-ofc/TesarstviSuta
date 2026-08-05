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
    ["Navigace je vyplněná bez JS (5 odkazů)", doc.querySelectorAll("#nav-desktop a").length === 5],
    ["Karty služeb jsou v HTML bez JS (4)", doc.querySelectorAll(".service-card").length === 4],
    ["Fotky realizací jsou v HTML bez JS (4)", doc.querySelectorAll(".gallery-item img").length === 4],
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
      json: async () => JSON.parse(data)
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

  // main.js registruje listener na DOMContentLoaded - ten už v jsdomu
  // proběhl dřív, než jsme stihli script vykonat, takže ho vyvoláme ručně.
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Počkáme na dokončení async init() (Promise.all fetchů + vykreslení)
  await new Promise((resolve) => setTimeout(resolve, 400));

  const doc = window.document;
  const checks = [
    ["Titulek stránky nastaven", doc.title.includes("Šuta")],
    ["Hero nadpis vykreslen", doc.getElementById("hero-title-1").textContent.length > 0],
    ["Hero 2. řádek vykreslen", doc.getElementById("hero-title-2").textContent.includes("Šuta")],
    ["Nav odkazy vykresleny (5)", doc.querySelectorAll("#nav-desktop a").length === 5],
    ["Karty služeb vykresleny (4)", doc.querySelectorAll(".service-card").length === 4],
    ["Položky galerie vykresleny (4)", doc.querySelectorAll(".gallery-item").length === 4],
    ["Statistiky vykresleny (3)", doc.querySelectorAll("#about-stats .stat").length === 3],
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
    ]
  ];

  console.log("--- Test po spuštění main.js (s daty z content.json) ---");
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });

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

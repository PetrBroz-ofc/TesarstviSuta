const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function testStaticHtml() {
  const html = fs.readFileSync(path.join(ROOT, "ochrana-udaju.html"), "utf8");
  const dom = new JSDOM(html); // BEZ JS
  const doc = dom.window.document;

  const checks = [
    ["Titulek je v syrovém HTML vyplněný", doc.getElementById("legal-title").textContent.trim().length > 0],
    ["Úvodní text je vyplněný", doc.getElementById("legal-intro").textContent.trim().length > 0],
    ["Sekce jsou v HTML bez JS (8)", doc.querySelectorAll(".legal-item").length === 8],
    ["Odkaz na ochranu údajů je v patičce", !!doc.querySelector('a[href="ochrana-udaju.html"]')],
    ["Odkaz na administraci je v patičce", !!doc.querySelector('a[href="admin.html"]')],
    ["Odkaz zpět na hlavní web existuje", !!doc.querySelector('a[href="index.html"]')]
  ];

  console.log("--- Test ochrana-udaju.html (syrové HTML, bez JS) ---");
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });
  console.log("");
  return allPassed;
}

async function testWithJs() {
  const html = fs.readFileSync(path.join(ROOT, "ochrana-udaju.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost:8123/ochrana-udaju.html",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const { window } = dom;

  const contentData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/content.json"), "utf8"));

  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("content.json")) return { ok: true, json: async () => contentData };
    return { ok: true, json: async () => ({}) };
  };

  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error || e.message));

  const legalSrc = fs.readFileSync(path.join(ROOT, "js/legal.js"), "utf8");
  window.eval(legalSrc);

  await new Promise((resolve) => setTimeout(resolve, 300));

  const doc = window.document;
  const checks = [
    ["Titulek stránky obsahuje pageTitle z JSON", doc.title.includes(contentData.legal.pageTitle)],
    [
      `Vykresleno správně ${contentData.legal.sections.length} odstavců z JSON`,
      doc.querySelectorAll(".legal-item").length === contentData.legal.sections.length
    ],
    [
      "První nadpis odpovídá datům z JSON",
      doc.querySelector(".legal-item h2")?.textContent === contentData.legal.sections[0].heading
    ],
    ["Kontaktní poznámka vykreslena", doc.getElementById("legal-contact-note").textContent === contentData.legal.contactNote],
    ["Žádné JS chyby za běhu", errors.length === 0]
  ];

  console.log("--- Test ochrana-udaju.html (po spuštění legal.js) ---");
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
  const staticOk = testStaticHtml();
  const jsOk = await testWithJs();
  process.exit(staticOk && jsOk ? 0 : 1);
})().catch((err) => {
  console.error("Test selhal s výjimkou:", err);
  process.exit(1);
});

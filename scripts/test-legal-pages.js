const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const PAGES = [
  { html: "ochrana-udaju.html", script: "js/legal.js", contentKey: "legal", expectedSections: 8 },
  { html: "reklamacni-rad.html", script: "js/warranty.js", contentKey: "warranty", expectedSections: 5 },
  { html: "obchodni-podminky.html", script: "js/terms.js", contentKey: "terms", expectedSections: 10 }
];

function testStaticHtml(page) {
  const html = fs.readFileSync(path.join(ROOT, page.html), "utf8");
  const dom = new JSDOM(html); // BEZ JS
  const doc = dom.window.document;

  const checks = [
    ["Titulek je v syrovém HTML vyplněný", doc.getElementById("legal-title").textContent.trim().length > 0],
    ["Úvodní text je vyplněný", doc.getElementById("legal-intro").textContent.trim().length > 0],
    [
      `Sekce jsou v HTML bez JS (${page.expectedSections})`,
      doc.querySelectorAll(".legal-item").length === page.expectedSections
    ],
    ["Odkazy na všechny 3 právní stránky jsou v patičce", ["ochrana-udaju.html", "reklamacni-rad.html", "obchodni-podminky.html"].every((f) => !!doc.querySelector(`a[href="${f}"]`))],
    ["IČO firmy a oba jednatelé jsou v patičce", doc.body.textContent.includes("07257732") && doc.body.textContent.includes("Jakub Šuta") && doc.body.textContent.includes("Milan Šuta")],
    ["Odkaz na administraci je v patičce", !!doc.querySelector('a[href="admin.html"]')]
  ];

  console.log(`--- Test ${page.html} (syrové HTML, bez JS) ---`);
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });
  console.log("");
  return allPassed;
}

async function testWithJs(page) {
  const html = fs.readFileSync(path.join(ROOT, page.html), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost:8123/" + page.html,
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

  const commonSrc = fs.readFileSync(path.join(ROOT, "js/site-common.js"), "utf8");
  const pageSrc = fs.readFileSync(path.join(ROOT, page.script), "utf8");
  window.eval(commonSrc + "\n;\n" + pageSrc);

  await new Promise((resolve) => setTimeout(resolve, 300));

  const doc = window.document;
  const pageData = contentData[page.contentKey];
  const checks = [
    ["Titulek stránky obsahuje pageTitle z JSON", doc.title.includes(pageData.pageTitle)],
    [
      `Vykresleno správně ${pageData.sections.length} odstavců z JSON`,
      doc.querySelectorAll(".legal-item").length === pageData.sections.length
    ],
    [
      "První nadpis odpovídá datům z JSON",
      doc.querySelector(".legal-item h2")?.textContent === pageData.sections[0].heading
    ],
    [
      "Kontaktní poznámka vykreslena",
      doc.getElementById("legal-contact-note").textContent === pageData.contactNote
    ],
    ["Žádné JS chyby za běhu", errors.length === 0]
  ];

  console.log(`--- Test ${page.html} (po spuštění ${page.script}) ---`);
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
  let allPassed = true;
  for (const page of PAGES) {
    const staticOk = testStaticHtml(page);
    const jsOk = await testWithJs(page);
    if (!staticOk || !jsOk) allPassed = false;
    console.log("");
  }
  process.exit(allPassed ? 0 : 1);
})().catch((err) => {
  console.error("Test selhal s výjimkou:", err);
  process.exit(1);
});

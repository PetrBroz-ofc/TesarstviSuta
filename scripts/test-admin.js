const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

async function run() {
  const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost:8123/admin.html",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const { window } = dom;

  const contentData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/content.json"), "utf8"));
  const themeData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/theme.json"), "utf8"));

  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/session")) {
      return { ok: true, json: async () => ({ authenticated: true }) };
    }
    if (u.includes("content.json")) {
      return { ok: true, json: async () => contentData };
    }
    if (u.includes("theme.json")) {
      return { ok: true, json: async () => themeData };
    }
    return { ok: true, json: async () => ({}) };
  };

  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.error || e.message));

  const imgEditorSrc = fs.readFileSync(path.join(ROOT, "js/image-editor.js"), "utf8");
  const adminSrc = fs.readFileSync(path.join(ROOT, "js/admin.js"), "utf8");
  window.eval(imgEditorSrc + "\n;\n" + adminSrc);

  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Počkáme na async init() -> checkSession() -> bootApp() -> loadContentAndTheme()
  await new Promise((resolve) => setTimeout(resolve, 400));

  const doc = window.document;
  const navItems = doc.querySelectorAll(".nav-item");
  const checks = [
    ["Aplikace je aktivní (přeskočilo login)", doc.getElementById("app").classList.contains("is-active")],
    ["Postranní navigace má 11 položek", navItems.length === 11],
    ["První položka (SEO) je aktivní na startu", navItems[0] && navItems[0].classList.contains("is-active")],
    ["Editor pane obsahuje SEO sekci na startu", doc.getElementById("editor-pane").textContent.includes("SEO a metadata")],
    ["Skupina 'Obsah' je v navigaci", doc.body.textContent.includes("Obsah")],
    ["Skupina 'Vzhled' je v navigaci", Array.from(doc.querySelectorAll(".nav-group-label")).some(el => el.textContent === "Vzhled")],
    ["Žádné JS chyby za běhu", errors.length === 0]
  ];

  console.log("--- Test admin.html - postranní navigace ---");
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });

  // Klikneme na sekci "Služby" a ověříme přepnutí
  const servicesBtn = Array.from(navItems).find((b) => b.textContent === "Služby");
  if (servicesBtn) {
    servicesBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const editorText = doc.getElementById("editor-pane").textContent;
    // Sidebar se po kliknutí přestaví (nové uzly), proto tlačítko hledáme znovu.
    const servicesBtnAfter = Array.from(doc.querySelectorAll(".nav-item")).find(
      (b) => b.textContent === "Služby"
    );
    const switched =
      editorText.includes("Přidat kartu služby") &&
      servicesBtnAfter &&
      servicesBtnAfter.classList.contains("is-active");
    console.log((switched ? "OK  " : "FAIL") + " - Klik na 'Služby' přepne aktivní sekci");
    if (!switched) allPassed = false;
  } else {
    console.log("FAIL - Tlačítko 'Služby' nenalezeno v navigaci");
    allPassed = false;
  }

  if (errors.length) {
    console.log("\nZachycené chyby:");
    errors.forEach((e) => console.log(" -", e && e.stack ? e.stack : e));
  }

  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Test selhal s výjimkou:", err);
  process.exit(1);
});

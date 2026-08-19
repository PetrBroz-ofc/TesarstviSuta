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
    if (u.includes("/api/login")) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (u.includes("/api/session")) {
      // I kdyby tohle admin.js zavolal, session se už NEMÁ používat k
      // automatickému přeskočení loginu - viz test níže.
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

  // Žádný ruční dispatch DOMContentLoaded - spoléháme na přirozený
  // (jednorázový) běh z jsdom, viz vysvětlení v test-render.js.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const doc = window.document;

  console.log("--- Test admin.html - vždy vyžaduje přihlášení ---");
  const initialChecks = [
    [
      "Po načtení stránky se ukáže login screen (i kdyby session platila)",
      doc.getElementById("login-screen").style.display !== "none"
    ],
    ["Aplikace NENÍ automaticky aktivní", !doc.getElementById("app").classList.contains("is-active")]
  ];
  let allPassed = true;
  initialChecks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });

  // Simulujeme zadání hesla a odeslání formuláře
  doc.getElementById("login-password").value = "test-heslo";
  doc.getElementById("login-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
  await new Promise((resolve) => setTimeout(resolve, 300));

  const navItems = doc.querySelectorAll(".nav-item");
  const afterLoginChecks = [
    ["Po přihlášení je aplikace aktivní", doc.getElementById("app").classList.contains("is-active")],
    ["Postranní navigace má 16 položek", navItems.length === 16],
    ["První položka (Hero) je aktivní na startu", navItems[0] && navItems[0].classList.contains("is-active")],
    ["Titulek sekce v topbaru je vyplněný (Hero)", doc.getElementById("section-title").textContent.includes("Hero")],
    ["Popisný pruh (section-description) existuje a má text", doc.querySelector(".section-description")?.textContent.length > 0],
    ["Bílá karta s poli (section-card) existuje", !!doc.querySelector(".section-card")],
    ["Odkaz 'Zobrazit náhled' míří na index.html", doc.getElementById("preview-link").getAttribute("href") === "index.html"],
    ["Skupina 'Textový obsah' je v navigaci", doc.body.textContent.includes("Textový obsah")],
    [
      "Skupina 'Vzhled' je v navigaci",
      Array.from(doc.querySelectorAll(".nav-group-label")).some((el) => el.textContent === "Vzhled")
    ],
    [
      "Skupina 'Pokročilé nastavení' je v navigaci",
      Array.from(doc.querySelectorAll(".nav-group-label")).some((el) => el.textContent === "Pokročilé nastavení")
    ],
    ["Žádné JS chyby za běhu", errors.length === 0]
  ];
  afterLoginChecks.forEach(([name, passed]) => {
    console.log((passed ? "OK  " : "FAIL") + " - " + name);
    if (!passed) allPassed = false;
  });

  // Klikneme na sekci "Služby" a ověříme přepnutí
  const servicesBtn = Array.from(navItems).find((b) => b.textContent === "Služby");
  if (servicesBtn) {
    servicesBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const editorText = doc.getElementById("editor-pane").textContent;
    const servicesBtnAfter = Array.from(doc.querySelectorAll(".nav-item")).find(
      (b) => b.textContent === "Služby"
    );
    const switched =
      editorText.includes("Přidat položku") &&
      servicesBtnAfter &&
      servicesBtnAfter.classList.contains("is-active");
    console.log((switched ? "OK  " : "FAIL") + " - Klik na 'Služby' přepne aktivní sekci");
    if (!switched) allPassed = false;

    const previewHref = doc.getElementById("preview-link").getAttribute("href");
    const previewOk = previewHref === "index.html#sluzby";
    console.log(
      (previewOk ? "OK  " : "FAIL") + " - Zobrazit náhled ukazuje na #sluzby po přepnutí sekce"
    );
    if (!previewOk) allPassed = false;
  } else {
    console.log("FAIL - Tlačítko 'Služby' nenalezeno v navigaci");
    allPassed = false;
  }

  // Klikneme na GDPR (vnořená položka pod Právní) a ověříme vlastní previewUrl
  const gdprBtn = Array.from(doc.querySelectorAll(".nav-item")).find((b) => b.textContent === "GDPR");
  if (gdprBtn) {
    gdprBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const editorText = doc.getElementById("editor-pane").textContent;
    const gdprOk =
      editorText.includes("Přidat odstavec") &&
      doc.getElementById("preview-link").getAttribute("href") === "ochrana-udaju.html";
    console.log((gdprOk ? "OK  " : "FAIL") + " - GDPR sekce se otevře a má vlastní Zobrazit náhled");
    if (!gdprOk) allPassed = false;
  } else {
    console.log("FAIL - Položka 'GDPR' nenalezena v navigaci");
    allPassed = false;
  }

  // Test tlačítka pro zobrazení hesla (zpět na fresh instanci by bylo čistší,
  // ale ověřit funkčnost lze i takto - element pořád existuje v DOM pod app).
  const pwToggle = doc.getElementById("password-toggle");
  console.log(
    (pwToggle ? "OK  " : "FAIL") + " - Tlačítko pro zobrazení hesla existuje v DOM"
  );
  if (!pwToggle) allPassed = false;

  // Test "Zahodit změny" - upravíme pole na sekci Hero, zahodíme, ověříme návrat
  // k původní hodnotě z (mockovaného) content.json.
  const heroBtn = Array.from(doc.querySelectorAll(".nav-item")).find((b) => b.textContent === "Hero");
  heroBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 50));

  const titleInput = doc.querySelector("#editor-pane input");
  const originalValue = titleInput.value;
  titleInput.value = "DOČASNÁ NEULOŽENÁ ZMĚNA";
  titleInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const dirtyStatusOk = doc.getElementById("save-status").textContent.includes("Neuložené");
  console.log((dirtyStatusOk ? "OK  " : "FAIL") + " - Po úpravě pole se zobrazí 'Neuložené změny'");
  if (!dirtyStatusOk) allPassed = false;

  window.confirm = () => true; // simulace potvrzení dialogu
  doc.getElementById("discard-btn").click();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const afterDiscardInput = doc.querySelector("#editor-pane input");
  const discardOk = afterDiscardInput && afterDiscardInput.value === originalValue;
  console.log(
    (discardOk ? "OK  " : "FAIL") + " - 'Zahodit změny' vrátí pole na původní hodnotu"
  );
  if (!discardOk) allPassed = false;

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


/**
 * POST /api/save
 * Body: { "file": "content" | "theme", "data": { ... } }
 *
 * Chráněný endpoint (vyžaduje platnou session). Uloží nový obsah do
 * data/content.json nebo data/theme.json v GitHub repozitáři.
 *
 * Bezpečnostní opatření:
 *  - `file` je vždy z pevného whitelistu (žádná cesta z uživatelského
 *    vstupu se neskládá do souborové cesty -> nelze přepsat jiný soubor)
 *  - limit velikosti payloadu
 *  - základní validace struktury dat, aby admin omylem neuložil obsah,
 *    který by rozbil vykreslení webu
 *  - rate limiting proti zneužití i po přihlášení
 */

const { applyCors, handlePreflight } = require("./_cors");
const { requireAuth } = require("./_auth");
const { checkRateLimit, getClientIp } = require("./_rate-limit");
const { getFile, putFile } = require("./_github");

const FILE_MAP = {
  content: "data/content.json",
  theme: "data/theme.json"
};

const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB je pro textový JSON obsahu více než dost

function validateContentShape(data) {
  const requiredTopLevel = [
    "meta",
    "header",
    "hero",
    "about",
    "services",
    "gallery",
    "scaffolding",
    "contact",
    "footer",
    "cookieConsent",
    "legal",
    "warranty",
    "terms"
  ];
  return requiredTopLevel.every((key) => Object.prototype.hasOwnProperty.call(data, key));
}

function validateThemeShape(data) {
  return data && typeof data === "object" && data.colors && typeof data.colors === "object";
}

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Metoda není povolena." });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`save:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "Příliš mnoho požadavků, zkuste to prosím za chvíli." });
    return;
  }

  const { file, data } = req.body || {};

  if (!file || !FILE_MAP[file]) {
    res.status(400).json({ error: "Neplatný cílový soubor." });
    return;
  }

  if (!data || typeof data !== "object") {
    res.status(400).json({ error: "Chybí data k uložení." });
    return;
  }

  const serialized = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    res.status(413).json({ error: "Data jsou příliš velká." });
    return;
  }

  const isValid = file === "content" ? validateContentShape(data) : validateThemeShape(data);
  if (!isValid) {
    res.status(422).json({ error: "Data neodpovídají očekávané struktuře webu." });
    return;
  }

  try {
    const path = FILE_MAP[file];
    const existing = await getFile(path);
    await putFile(
      path,
      serialized,
      `Admin: aktualizace ${path}`,
      existing ? existing.sha : null
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Chyba při ukládání do GitHub:", err.message);
    res.status(502).json({ error: "Uložení se nezdařilo. Zkuste to prosím znovu." });
  }
};

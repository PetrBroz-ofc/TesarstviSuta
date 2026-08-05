/**
 * POST /api/upload-image
 * Body: { "filename": "muj-obrazek.jpg", "mimeType": "image/jpeg", "base64": "..." }
 *
 * Chráněný endpoint pro nahrávání fotografií realizací z administrace.
 *
 * Bezpečnostní opatření:
 *  - vyžaduje platnou session
 *  - whitelist povolených MIME typů (jpeg/png/webp) - ŽÁDNÁ spustitelná
 *    přípona ani SVG (SVG může obsahovat JavaScript -> XSS riziko)
 *  - kontrola "magic bytes" na začátku souboru, aby obsah skutečně
 *    odpovídal deklarovanému typu (nejde jen o přejmenovanou příponu)
 *  - limit velikosti souboru (8 MB)
 *  - název souboru se NIKDY nepoužije doslova z uživatelského vstupu —
 *    vygeneruje se bezpečný unikátní název, čímž se vylučuje path traversal
 *    (např. "../../api/login.js") i kolize/přepsání existujících souborů
 */

const crypto = require("crypto");
const { applyCors, handlePreflight } = require("./_cors");
const { requireAuth } = require("./_auth");
const { checkRateLimit, getClientIp } = require("./_rate-limit");
const { putFile } = require("./_github");

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_TYPES = {
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] } // "RIFF", WEBP je na bajtech 8-11
};

function matchesMagicBytes(buffer, magic) {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
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
  const rl = checkRateLimit(`upload:${ip}`, 15, 60_000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "Příliš mnoho nahrávání, zkuste to prosím za chvíli." });
    return;
  }

  const { mimeType, base64 } = req.body || {};

  const typeInfo = ALLOWED_TYPES[mimeType];
  if (!typeInfo) {
    res.status(400).json({ error: "Nepovolený typ souboru. Použijte JPG, PNG nebo WEBP." });
    return;
  }

  if (!base64 || typeof base64 !== "string") {
    res.status(400).json({ error: "Chybí obsah souboru." });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    res.status(400).json({ error: "Neplatná data souboru." });
    return;
  }

  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    res.status(413).json({ error: "Soubor je prázdný nebo příliš velký (max. 8 MB)." });
    return;
  }

  if (!matchesMagicBytes(buffer, typeInfo.magic)) {
    res.status(422).json({ error: "Obsah souboru neodpovídá deklarovanému typu obrázku." });
    return;
  }

  const safeName = `realizace-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${typeInfo.ext}`;
  const repoPath = `images/uploads/${safeName}`;

  try {
    await putFile(repoPath, base64, `Admin: nahrání obrázku ${safeName}`, null, true);
    res.status(200).json({ ok: true, path: `/${repoPath}` });
  } catch (err) {
    console.error("Chyba při nahrávání obrázku do GitHub:", err.message);
    res.status(502).json({ error: "Nahrání se nezdařilo. Zkuste to prosím znovu." });
  }
};

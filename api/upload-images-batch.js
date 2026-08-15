/**
 * POST /api/upload-images-batch
 * Body: { "files": [{ "mimeType": "image/jpeg", "base64": "..." }, ...] }
 *
 * Chráněný endpoint pro hromadné nahrávání víc fotek najednou (např. celé
 * album realizace) - VŠECHNY soubory se zapíšou v JEDNOM atomickém Git
 * commitu, takže spustí jen JEDNO nasazení na Vercelu bez ohledu na počet
 * souborů. Bez tohohle by nahrání např. 8 fotek spustilo 8 nasazení rychle
 * po sobě, což může vést k dočasně zaseklé chybové odpovědi v CDN pro
 * soubor, který se "objevil" mezi dvěma nasazeními.
 *
 * Bezpečnostní opatření: stejná jako u /api/upload-image (whitelist typů,
 * magic bytes, limit velikosti, bezpečné vygenerované názvy souborů) -
 * aplikovaná na KAŽDÝ soubor v dávce. Pokud jeden soubor v dávce neprojde
 * validací, odmítne se celá dávka (žádné částečné nahrání).
 */

const crypto = require("crypto");
const { applyCors, handlePreflight } = require("./_cors");
const { requireAuth } = require("./_auth");
const { checkRateLimit, getClientIp } = require("./_rate-limit");
const { putFilesBatch } = require("./_github");

const MAX_BYTES_PER_FILE = 4 * 1024 * 1024; // 4 MB na soubor
const MAX_FILES_PER_BATCH = 12; // rozumný strop na jeden request
const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // ~3 MB dekódovaně na celou davku (rezerva do limitu Vercelu ~4,5 MB/request na base64 payload)

const ALLOWED_TYPES = {
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
  "application/pdf": { ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }
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
  const rl = checkRateLimit(`upload-batch:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "Příliš mnoho nahrávání, zkuste to prosím za chvíli." });
    return;
  }

  const { files } = req.body || {};
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "Chybí seznam souborů." });
    return;
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    res.status(400).json({ error: `Najednou lze nahrát nejvýš ${MAX_FILES_PER_BATCH} souborů.` });
    return;
  }

  const prepared = [];
  let totalBytes = 0;

  for (const f of files) {
    const typeInfo = ALLOWED_TYPES[f && f.mimeType];
    if (!typeInfo) {
      res.status(400).json({ error: "Nepovolený typ souboru. Použijte JPG, PNG, WEBP nebo PDF." });
      return;
    }
    if (!f.base64 || typeof f.base64 !== "string") {
      res.status(400).json({ error: "Chybí obsah souboru." });
      return;
    }

    let buffer;
    try {
      buffer = Buffer.from(f.base64, "base64");
    } catch {
      res.status(400).json({ error: "Neplatná data souboru." });
      return;
    }

    if (buffer.length === 0 || buffer.length > MAX_BYTES_PER_FILE) {
      res.status(413).json({ error: "Soubor je prázdný nebo příliš velký (max. 4 MB)." });
      return;
    }
    if (!matchesMagicBytes(buffer, typeInfo.magic)) {
      res.status(422).json({ error: "Obsah souboru neodpovídá deklarovanému typu." });
      return;
    }

    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      res.status(413).json({ error: "Součet velikostí souborů v jedné dávce je příliš velký. Nahrajte méně souborů najednou." });
      return;
    }

    const safeName = `upload-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${typeInfo.ext}`;
    prepared.push({ path: `images/uploads/${safeName}`, base64: f.base64 });
  }

  try {
    await putFilesBatch(prepared, `Admin: hromadné nahrání ${prepared.length} souborů`);
    res.status(200).json({ ok: true, paths: prepared.map((p) => p.path) });
  } catch (err) {
    console.error("Chyba při hromadném nahrávání do GitHub:", err.message);
    res.status(502).json({ error: "Nahrání se nezdařilo. Zkuste to prosím znovu." });
  }
};

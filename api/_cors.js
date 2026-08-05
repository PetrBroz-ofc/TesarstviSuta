/**
 * _cors.js
 * Centrální CORS politika pro všechny API endpointy.
 * Bezpečnostní princip: povolujeme POUZE vlastní doménu (whitelist),
 * ne "Access-Control-Allow-Origin: *" — administrace pracuje s citlivými
 * akcemi (přihlášení, zápis obsahu, upload souborů).
 */

function getAllowedOrigins() {
  // ALLOWED_ORIGIN může obsahovat čárkou oddělený seznam domén,
  // např. "https://tesarstvi-suta.cz,https://www.tesarstvi-suta.cz"
  const raw = process.env.ALLOWED_ORIGIN || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const allowed = getAllowedOrigins();
  const origin = req.headers.origin;

  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (allowed.length === 0) {
    // Není nakonfigurováno -> v produkci raději nepovolit nic (fail closed).
    // Během lokálního vývoje si ALLOWED_ORIGIN nastavte v .env na http://localhost:PORT.
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Ochrana proti MIME sniffingu a clickjackingu na API odpovědích
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
}

function handlePreflight(req, res) {
  if (req.method === "OPTIONS") {
    applyCors(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors, handlePreflight, getAllowedOrigins };

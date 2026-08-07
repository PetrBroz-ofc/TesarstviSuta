/**
 * POST /api/login
 * Body: { "password": "..." }
 *
 * Bezpečnostní opatření:
 *  - rate limiting podle IP adresy (5 pokusů / minutu) proti brute-force
 *  - heslo se porovnává v konstantním čase (viz _auth.js), takže i když
 *    je uložené v čitelné podobě v proměnné prostředí ADMIN_PASSWORD,
 *    nejde ho uhodnout podle rychlosti odpovědi
 *  - úspěšné i neúspěšné pokusy vrací stejně rychlou odpověď (žádný
 *    "user enumeration" - endpoint má jen jedno jméno "admin")
 *  - session cookie je HttpOnly + Secure + SameSite=Strict
 */

const { applyCors, handlePreflight } = require("./_cors");
const { checkRateLimit, getClientIp } = require("./_rate-limit");
const { verifyPassword, createSessionToken, setSessionCookie } = require("./_auth");

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Metoda není povolena." });
    return;
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({
      error: `Příliš mnoho pokusů o přihlášení. Zkuste to znovu za ${rl.retryAfterSec} s.`
    });
    return;
  }

  const password = req.body && typeof req.body.password === "string" ? req.body.password : "";

  if (!password || password.length > 512) {
    res.status(400).json({ error: "Neplatný požadavek." });
    return;
  }

  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    console.error("ADMIN_PASSWORD není nastaven.");
    res.status(500).json({ error: "Administrace není správně nakonfigurována." });
    return;
  }

  const valid = verifyPassword(password, expectedPassword);
  if (!valid) {
    res.status(401).json({ error: "Nesprávné heslo." });
    return;
  }

  const token = createSessionToken({ role: "admin" });
  setSessionCookie(res, token);
  res.status(200).json({ ok: true });
};

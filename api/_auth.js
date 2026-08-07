/**
 * _auth.js
 * Bezpečnostní jádro administrace:
 *  - heslo se nastavuje přímo jako proměnná prostředí ADMIN_PASSWORD ve
 *    Vercelu - kdykoliv si ho tam sami změníte, žádný přepočet není potřeba
 *  - porovnání hesla PŘESTO probíhá v konstantním čase (přes SHA-256 otisk
 *    obou stran + crypto.timingSafeEqual), aby nešlo heslo uhodnout na
 *    základě doby odezvy (timing attack) - i když je uložené v čitelné
 *    podobě, nikdy se neporovnává naivním "===" řetězců
 *  - session je stateless podepsaný token (HMAC-SHA256), uložený
 *    v httpOnly + Secure + SameSite=Strict cookie, takže není čitelný
 *    z JavaScriptu na frontendu (ochrana proti XSS krádeži session)
 */

const crypto = require("crypto");

const SESSION_COOKIE_NAME = "suta_session";
const SESSION_TTL_SECONDS = 60 * 60 * 4; // 4 hodiny

/* ---------------- Heslo (přímé porovnání, konstantní čas) ---------------- */

function verifyPassword(submittedPassword, expectedPassword) {
  if (!expectedPassword || !submittedPassword) return false;
  // Obě strany se otisknou přes SHA-256, aby crypto.timingSafeEqual vždy
  // dostal stejně dlouhé bloky bez ohledu na délku hesla - samotné heslo
  // se tím nikam neukládá, jde jen o bezpečné porovnání za běhu.
  const a = crypto.createHash("sha256").update(String(submittedPassword)).digest();
  const b = crypto.createHash("sha256").update(String(expectedPassword)).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------------- Session token (podepsaný, bez závislostí) ---------------- */

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return Buffer.from(input, "base64").toString("utf8");
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET není nastaven (nebo je příliš krátký). Nastavte silný náhodný řetězec v proměnných prostředí."
    );
  }
  return secret;
}

function createSessionToken(payload = {}) {
  const secret = getSecret();
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const encodedBody = base64url(JSON.stringify(body));
  const signature = crypto.createHmac("sha256", secret).update(encodedBody).digest("hex");
  return `${encodedBody}.${signature}`;
}

function verifySessionToken(token) {
  try {
    const secret = getSecret();
    const [encodedBody, signature] = String(token).split(".");
    if (!encodedBody || !signature) return null;

    const expectedSig = crypto.createHmac("sha256", secret).update(encodedBody).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(base64urlDecode(encodedBody));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------------- Cookie helpery ---------------- */

function setSessionCookie(res, token) {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  );
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

/** Middleware-styl kontrola: vrátí session payload, nebo pošle 401 a vrátí null. */
function requireAuth(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const session = token ? verifySessionToken(token) : null;
  if (!session) {
    res.status(401).json({ error: "Nejste přihlášeni nebo session vypršela." });
    return null;
  }
  return session;
}

module.exports = {
  SESSION_COOKIE_NAME,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  requireAuth
};

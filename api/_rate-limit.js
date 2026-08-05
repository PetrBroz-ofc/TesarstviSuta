/**
 * _rate-limit.js
 * Jednoduchý in-memory rate limiter (sliding window) pro ochranu
 * přihlašovacího a zápisového API proti brute-force / spamu.
 *
 * POZNÁMKA K OMEZENÍ: Vercel serverless funkce běží ve více instancích
 * a "za studena" se paměť resetuje, takže tento limiter je best-effort
 * ochrana, ne kryptograficky pevná záruka. V praxi ale výrazně ztíží
 * automatizované útoky. Pro vysoký provoz doporučujeme napojit Upstash
 * Redis (@upstash/ratelimit) — kód je připraven tak, aby šlo funkci
 * "checkRateLimit" snadno nahradit implementací nad Redisem.
 */

const buckets = new Map();

// Občasný úklid staré paměti, aby Map neztrácela s časem výkon.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.windowStart > 10 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

/**
 * @param {string} key - unikátní klíč (např. `login:${ip}`)
 * @param {number} limit - maximální počet požadavků v okně
 * @param {number} windowMs - délka okna v ms
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
 */
function checkRateLimit(key, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: limit - entry.count, retryAfterSec: 0 };
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = { checkRateLimit, getClientIp };

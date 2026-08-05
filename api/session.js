/**
 * GET /api/session
 * Vrátí, zda je aktuální návštěvník přihlášen (bez odhalování dalších detailů).
 */

const { applyCors, handlePreflight } = require("./_cors");
const { parseCookies, verifySessionToken, SESSION_COOKIE_NAME } = require("./_auth");

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const session = token ? verifySessionToken(token) : null;

  res.status(200).json({ authenticated: !!session });
};

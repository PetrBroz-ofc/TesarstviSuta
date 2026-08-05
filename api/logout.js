/**
 * POST /api/logout
 * Zneplatní session cookie.
 */

const { applyCors, handlePreflight } = require("./_cors");
const { clearSessionCookie } = require("./_auth");

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Metoda není povolena." });
    return;
  }

  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};

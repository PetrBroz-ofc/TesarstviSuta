#!/usr/bin/env node
/**
 * Vygeneruje scrypt hash hesla pro proměnnou prostředí ADMIN_PASSWORD_HASH.
 * Použití:
 *   node scripts/hash-password.js "moje-tajne-heslo"
 *
 * Vypsanou hodnotu (salt:hash) vložte do Vercel → Project Settings →
 * Environment Variables → ADMIN_PASSWORD_HASH. Samotné heslo se nikam
 * neukládá, jen tento nevratný hash.
 */

const crypto = require("crypto");

const password = process.argv[2];

if (!password) {
  console.error("Použití: node scripts/hash-password.js \"vase-heslo\"");
  process.exit(1);
}

if (password.length < 10) {
  console.warn(
    "Upozornění: heslo je kratší než 10 znaků. Pro administraci webu doporučujeme silnější heslo (např. víceslovnou frázi)."
  );
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");

console.log("\nADMIN_PASSWORD_HASH=" + salt + ":" + hash + "\n");
console.log("Tuto hodnotu vložte do Vercel environment variables jako ADMIN_PASSWORD_HASH.");

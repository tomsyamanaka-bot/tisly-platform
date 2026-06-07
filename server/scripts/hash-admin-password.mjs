#!/usr/bin/env node
/**
 * ADMIN_PASSWORD_HASH 生成 — loginAdmin と同じ scrypt 形式（src/auth/password.ts と同期）
 *
 * Usage:
 *   npm run hash:admin-password -- 'your-strong-password'
 *   node scripts/hash-admin-password.mjs 'your-strong-password'
 */
import { randomBytes, scryptSync } from "crypto";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash:admin-password -- 'your-strong-password'");
  console.error("       node scripts/hash-admin-password.mjs 'your-strong-password'");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Error: password must be at least 8 characters");
  process.exit(1);
}

const hash = hashPassword(password);
console.log("");
console.log("ADMIN_PASSWORD_HASH=" + hash);
console.log("");
console.log("Paste the line above into server/.env, then restart: systemctl restart tisly-server");

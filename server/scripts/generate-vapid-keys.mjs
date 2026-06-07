#!/usr/bin/env node
/**
 * VAPID 鍵ペア生成 — Web Push 用（web-push と同一形式）
 *
 * Usage:
 *   npm run vapid:generate          # 鍵を stdout に出力
 *   npm run vapid:setup             # 未設定なら .env に自動書き込み
 *   npm run vapid:generate -- --write   # 強制的に .env に書き込み（既存鍵は上書き）
 *   npm run vapid:generate -- --check   # .env の設定確認
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, "..");
const envPath = resolve(serverDir, ".env");
const envExamplePath = resolve(serverDir, ".env.example");

const VAPID_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
const DEFAULT_SUBJECT = "mailto:admin@tisly.jp";

function readEnvFile() {
  if (!existsSync(envPath)) return "";
  return readFileSync(envPath, "utf8");
}

function readEnvValue(key) {
  const text = readEnvFile();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== key) continue;
    return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function ensureEnvFile() {
  if (existsSync(envPath)) return;
  if (existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath);
    console.log(`Created ${envPath} from .env.example`);
    return;
  }
  writeFileSync(envPath, `# TiSLY server/.env\n${VAPID_KEYS.map((k) => `${k}=\n`).join("")}`, "utf8");
  console.log(`Created minimal ${envPath}`);
}

function upsertEnvValues(values) {
  ensureEnvFile();
  let text = readEnvFile();
  const lines = text.split(/\r?\n/);
  const updated = new Set();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name in values) {
      lines[i] = `${name}=${values[name]}`;
      updated.add(name);
    }
  }

  for (const [key, val] of Object.entries(values)) {
    if (!updated.has(key)) {
      lines.push(`${key}=${val}`);
    }
  }

  writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"), "utf8");
}

function keysConfigured() {
  return !!(readEnvValue("VAPID_PUBLIC_KEY") && readEnvValue("VAPID_PRIVATE_KEY"));
}

const args = process.argv.slice(2);
const forceWrite = args.includes("--write");
const setupMode = args.includes("--setup");

if (args.includes("--check")) {
  if (!existsSync(envPath)) {
    console.error("Error: server/.env not found");
    console.error("Run: npm run vapid:setup");
    process.exit(1);
  }
  const publicKey = readEnvValue("VAPID_PUBLIC_KEY");
  const privateKey = readEnvValue("VAPID_PRIVATE_KEY");
  const subject = readEnvValue("VAPID_SUBJECT") || DEFAULT_SUBJECT;

  if (!publicKey || !privateKey) {
    console.error("VAPID keys: NOT CONFIGURED");
    console.error("Run: npm run vapid:setup");
    process.exit(1);
  }
  console.log("VAPID keys: OK");
  console.log(`  VAPID_PUBLIC_KEY=${publicKey.slice(0, 12)}…`);
  console.log(`  VAPID_PRIVATE_KEY=[set]`);
  console.log(`  VAPID_SUBJECT=${subject}`);
  process.exit(0);
}

if (setupMode) {
  if (keysConfigured()) {
    console.log("VAPID keys: already configured in server/.env");
    console.log("Run: npm run vapid:generate -- --check");
    process.exit(0);
  }
  const keys = webpush.generateVAPIDKeys();
  upsertEnvValues({
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: DEFAULT_SUBJECT,
  });
  console.log("VAPID keys: written to server/.env");
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey.slice(0, 12)}…`);
  console.log(`  VAPID_PRIVATE_KEY=[set]`);
  console.log(`  VAPID_SUBJECT=${DEFAULT_SUBJECT}`);
  console.log("");
  console.log("Next: restart the server (npm run dev  or  systemctl restart tisly-server)");
  console.log("Verify: npm run vapid:generate -- --check");
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
const values = {
  VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: DEFAULT_SUBJECT,
};

if (forceWrite) {
  upsertEnvValues(values);
  console.log("VAPID keys: written to server/.env");
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey.slice(0, 12)}…`);
  console.log("Restart the server, then: npm run vapid:generate -- --check");
  process.exit(0);
}

console.log("");
console.log("# Paste the following into server/.env (never commit the private key)");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=${DEFAULT_SUBJECT}`);
console.log("");
console.log("Or auto-write:");
console.log("  npm run vapid:setup");
console.log("");
console.log("See docs/vapid_env_setup.md for full instructions.");

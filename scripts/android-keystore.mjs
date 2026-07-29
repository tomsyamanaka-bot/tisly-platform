#!/usr/bin/env node
/**
 * Create a local Android upload keystore for TiSLY TWA (gitignored).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const keystore = path.join(androidDir, "android.keystore");
const alias = "tisly";

function findKeytool() {
  const candidates = [];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, "bin", "keytool"));
  }
  const jdkRoot = path.join(androidDir, ".jdk");
  if (fs.existsSync(jdkRoot)) {
    for (const n of fs.readdirSync(jdkRoot)) {
      candidates.push(path.join(jdkRoot, n, "bin", "keytool"));
    }
  }
  for (const parent of [
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Java",
  ]) {
    if (!fs.existsSync(parent)) continue;
    for (const n of fs.readdirSync(parent)) {
      if (!n.toLowerCase().includes("jdk")) continue;
      candidates.push(path.join(parent, n, "bin", "keytool"));
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c + ".exe")) return c + ".exe";
    if (fs.existsSync(c)) return c;
  }
  return null;
}

if (fs.existsSync(keystore)) {
  console.log(`[android:keystore] Already exists: ${keystore}`);
  process.exit(0);
}

const password =
  process.env.TISLY_ANDROID_KEYSTORE_PASSWORD ||
  process.env.BUBBLEWRAP_KEYSTORE_PASSWORD ||
  "tisly-android-dev";
const keytool = findKeytool();
if (!keytool) {
  console.error("[android:keystore] keytool not found. Install JDK 17 first.");
  process.exit(1);
}

const args = [
  "-genkeypair",
  "-v",
  "-keystore",
  keystore,
  "-alias",
  alias,
  "-keyalg",
  "RSA",
  "-keysize",
  "2048",
  "-validity",
  "10000",
  "-storepass",
  password,
  "-keypass",
  password,
  "-dname",
  "CN=TiSLY,OU=TOMS,O=TOMS,L=Tokyo,ST=Tokyo,C=JP",
];

console.log(`[android:keystore] Creating ${keystore}`);
const r = spawnSync(keytool, args, { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);
console.log("[android:keystore] Done. Keep the password safe; do not commit the keystore.");
console.log(`[android:keystore] Default password used: ${password === "tisly-android-dev" ? "tisly-android-dev (change for production)" : "(from env)"}`);

#!/usr/bin/env node
/**
 * Sync SHA-256 fingerprint from android.keystore into assetlinks.json + twa-manifest fingerprints.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const keystore = path.join(androidDir, "android.keystore");
const assetlinksPath = path.join(root, "server", "public", ".well-known", "assetlinks.json");
const twaPath = path.join(androidDir, "twa-manifest.json");
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
  candidates.push("keytool");
  for (const c of candidates) {
    if (c === "keytool") return c;
    if (fs.existsSync(c + ".exe")) return c + ".exe";
    if (fs.existsSync(c)) return c;
  }
  return null;
}

if (!fs.existsSync(keystore)) {
  console.error("[android:sync-assetlinks] Missing android/android.keystore — run npm run android:keystore");
  process.exit(1);
}

const password =
  process.env.TISLY_ANDROID_KEYSTORE_PASSWORD ||
  process.env.BUBBLEWRAP_KEYSTORE_PASSWORD ||
  "tisly-android-dev";
const keytool = findKeytool();
const r = spawnSync(
  keytool,
  ["-list", "-v", "-keystore", keystore, "-alias", alias, "-storepass", password],
  { encoding: "utf8", shell: process.platform === "win32" }
);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}
const out = `${r.stdout}\n${r.stderr}`;
const m = out.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
if (!m) {
  console.error("[android:sync-assetlinks] SHA256 fingerprint not found in keytool output");
  process.exit(1);
}
const fingerprint = m[1].toUpperCase().replace(/:/g, "");
const colonForm = fingerprint.match(/.{2}/g).join(":");

const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.tisly.app",
      sha256_cert_fingerprints: [colonForm],
    },
  },
];
fs.mkdirSync(path.dirname(assetlinksPath), { recursive: true });
fs.writeFileSync(assetlinksPath, JSON.stringify(assetlinks, null, 2) + "\n");

const twa = JSON.parse(fs.readFileSync(twaPath, "utf8"));
const existing = Array.isArray(twa.fingerprints) ? twa.fingerprints : [];
const withoutUpload = existing.filter((f) => f?.name !== "upload");
withoutUpload.push({ name: "upload", value: colonForm });
twa.fingerprints = withoutUpload;
fs.writeFileSync(twaPath, JSON.stringify(twa, null, 2) + "\n");

console.log(`[android:sync-assetlinks] Updated ${assetlinksPath}`);
console.log(`[android:sync-assetlinks] Fingerprint: ${colonForm}`);
console.log(
  "[android:sync-assetlinks] After Play App Signing, also add the Play Console app-signing SHA-256."
);

#!/usr/bin/env node
/**
 * リリース鍵の SHA-256 を assetlinks.json / twa-manifest へ反映
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KEY_ALIAS,
  findKeytool,
  findJdkHome,
  getSigningPassword,
  legacyKeystorePath,
  releaseKeystorePath,
} from "./android-keystore-shared.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const releaseKs = releaseKeystorePath(androidDir);
const legacyKs = legacyKeystorePath(androidDir);
const keystore = fs.existsSync(releaseKs) ? releaseKs : legacyKs;
const assetlinksPath = path.join(root, "server", "public", ".well-known", "assetlinks.json");
const twaPath = path.join(androidDir, "twa-manifest.json");

if (!process.env.JAVA_HOME) {
  const jdk = findJdkHome(androidDir);
  if (jdk) process.env.JAVA_HOME = jdk;
}

if (!fs.existsSync(keystore)) {
  console.error(
    "[android:sync-assetlinks] Missing release keystore — run npm run android:keystore"
  );
  process.exit(1);
}

const password = getSigningPassword();
const keytool = findKeytool(androidDir);
const r = spawnSync(
  keytool,
  ["-list", "-v", "-keystore", keystore, "-alias", KEY_ALIAS, "-storepass", password],
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
if (twa.signingKey) {
  twa.signingKey.path = `./${path.basename(keystore)}`;
  twa.signingKey.alias = KEY_ALIAS;
}
fs.writeFileSync(twaPath, JSON.stringify(twa, null, 2) + "\n");

console.log(`[android:sync-assetlinks] Keystore: ${keystore}`);
console.log(`[android:sync-assetlinks] Updated ${assetlinksPath}`);
console.log(`[android:sync-assetlinks] Fingerprint: ${colonForm}`);
console.log(
  "[android:sync-assetlinks] Play App Signing 利用時は Console の署名 SHA-256 も追加"
);

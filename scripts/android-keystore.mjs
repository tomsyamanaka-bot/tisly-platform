#!/usr/bin/env node
/**
 * リリース用キーストア tisly-release-key.jks を生成（gitignore）
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
const keystore = releaseKeystorePath(androidDir);
const legacy = legacyKeystorePath(androidDir);

if (!process.env.JAVA_HOME) {
  const jdk = findJdkHome(androidDir);
  if (jdk) process.env.JAVA_HOME = jdk;
}

if (fs.existsSync(keystore)) {
  console.log(`[android:keystore] Already exists: ${keystore}`);
  process.exit(0);
}

// 既存 android.keystore があれば同一鍵をコピー（DAL指紋維持）
if (fs.existsSync(legacy)) {
  fs.copyFileSync(legacy, keystore);
  console.log(`[android:keystore] Copied legacy key → ${keystore}`);
  process.exit(0);
}

const password = getSigningPassword();
const keytool = findKeytool(androidDir);
if (!keytool) {
  console.error("[android:keystore] keytool not found. Install JDK 17 first.");
  process.exit(1);
}

const args = [
  "-genkeypair",
  "-v",
  "-storetype",
  "JKS",
  "-keystore",
  keystore,
  "-alias",
  KEY_ALIAS,
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
console.log("[android:keystore] Done. Do not commit the keystore file.");
console.log(
  `[android:keystore] Default password: ${password === "tisly-android-dev" ? "tisly-android-dev" : "(from env)"}`
);

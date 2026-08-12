/**
 * TiSLY Android リリース署名 — 共通パス・JDK/keytool 探索
 */
import fs from "node:fs";
import path from "node:path";

export const RELEASE_KEYSTORE_FILE = "tisly-release-key.jks";
export const LEGACY_KEYSTORE_FILE = "android.keystore";
export const KEY_ALIAS = "tisly";

export function getSigningPassword() {
  return (
    process.env.TISLY_ANDROID_KEYSTORE_PASSWORD ||
    process.env.BUBBLEWRAP_KEYSTORE_PASSWORD ||
    process.env.BUBBLEWRAP_KEY_PASSWORD ||
    "tisly-android-dev"
  );
}

export function findJdkHome(androidDir) {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  const localJdkRoot = path.join(androidDir, ".jdk");
  if (fs.existsSync(localJdkRoot)) {
    const hit = fs
      .readdirSync(localJdkRoot)
      .map((n) => path.join(localJdkRoot, n))
      .find(
        (p) =>
          fs.existsSync(path.join(p, "bin", "java.exe")) ||
          fs.existsSync(path.join(p, "bin", "java"))
      );
    if (hit) return hit;
  }
  return null;
}

export function findKeytool(androidDir) {
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
  for (const c of candidates) {
    if (fs.existsSync(c + ".exe")) return c + ".exe";
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function releaseKeystorePath(androidDir) {
  return path.join(androidDir, RELEASE_KEYSTORE_FILE);
}

export function legacyKeystorePath(androidDir) {
  return path.join(androidDir, LEGACY_KEYSTORE_FILE);
}

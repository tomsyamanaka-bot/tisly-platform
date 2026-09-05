#!/usr/bin/env node
/**
 * Validate Capacitor iOS scaffolding without requiring macOS / Xcode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const required = [
  "capacitor.config.ts",
  "package.json",
  ".github/workflows/ios-deploy.yml",
  "docs/ios-deploy-guide.md",
  "scripts/prepare-capacitor-www.mjs",
  "scripts/ios-patch-info-plist.mjs",
  "scripts/ios-render-export-options.mjs",
  "ios-ci/ExportOptions.plist",
  "ios-ci/fastlane/Fastfile",
  "ios-ci/fastlane/Appfile",
];

let failed = false;
for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`[ios-check] MISSING: ${rel}`);
    failed = true;
  } else {
    console.log(`[ios-check] OK: ${rel}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const needDeps = [
  "@capacitor/core",
  "@capacitor/ios",
  "@capacitor/cli",
  "@capacitor/camera",
  "@capacitor/push-notifications",
];
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const name of needDeps) {
  if (!allDeps[name]) {
    console.error(`[ios-check] MISSING dep: ${name}`);
    failed = true;
  } else {
    console.log(`[ios-check] dep OK: ${name}@${allDeps[name]}`);
  }
}

const cfg = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
if (!cfg.includes("jp.tisly.app") || !cfg.includes("webDir")) {
  console.error("[ios-check] capacitor.config.ts missing appId/webDir");
  failed = true;
} else {
  console.log("[ios-check] capacitor.config.ts appId/webDir OK");
}

if (failed) {
  console.error("[ios-check] FAILED");
  process.exit(1);
}
console.log("[ios-check] All checks passed");

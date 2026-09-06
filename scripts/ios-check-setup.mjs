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
  ".github/workflows/ios-build-deploy.yml",
  ".github/workflows/ios-deploy.yml",
  "docs/ios-deploy-guide.md",
  "docs/IOS_SECRETS_SETUP.md",
  "scripts/prepare-capacitor-www.mjs",
  "scripts/ios-patch-info-plist.mjs",
  "scripts/ios-configure-xcode.rb",
  "scripts/ios-patch-podfile.sh",
  "scripts/ios-make-ipa.sh",
  "ios-ci/ExportOptions.plist",
  "ios-ci/Info.plist.permissions.template.xml",
  "ios-ci/apple-team-id",
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

const wf = fs.readFileSync(
  path.join(root, ".github/workflows/ios-build-deploy.yml"),
  "utf8"
);
if (/\b(gem install fastlane|fastlane release|uses:.*fastlane)/i.test(wf)) {
  console.error("[ios-check] ios-build-deploy.yml still invokes fastlane");
  failed = true;
} else {
  console.log("[ios-check] workflow does not invoke fastlane");
}
if (!wf.includes("xcodebuild") || !wf.includes("allowProvisioningUpdates")) {
  console.error("[ios-check] workflow missing xcodebuild / allowProvisioningUpdates");
  failed = true;
} else {
  console.log("[ios-check] xcodebuild + allowProvisioningUpdates OK");
}
if (!wf.includes("ios/App/build/TiSLY.ipa")) {
  console.error("[ios-check] workflow missing canonical IPA path ios/App/build/TiSLY.ipa");
  failed = true;
} else {
  console.log("[ios-check] canonical IPA path OK");
}
if (!wf.includes("APP_TEAM_ID") || !wf.includes("APPLE_TEAM_ID")) {
  console.error("[ios-check] workflow must accept APPLE_TEAM_ID and APP_TEAM_ID");
  failed = true;
} else {
  console.log("[ios-check] Team ID aliases OK");
}
if (!wf.includes("gem install cocoapods")) {
  console.error("[ios-check] workflow should gem-install cocoapods after setup-ruby");
  failed = true;
} else {
  console.log("[ios-check] gem cocoapods install OK");
}
if (!wf.includes("upload-testflight-build")) {
  console.error("[ios-check] workflow missing apple-actions/upload-testflight-build");
  failed = true;
} else {
  console.log("[ios-check] TestFlight upload action OK");
}

const makeIpa = fs.readFileSync(path.join(root, "scripts/ios-make-ipa.sh"), "utf8");
if (/Packaging IPA from archive|ditto -c -k/.test(makeIpa) && !/Payload zip fallback is DISABLED|DISABLED/.test(makeIpa)) {
  console.error("[ios-check] ios-make-ipa.sh must not Payload-zip without provisioning (ITMS-90174)");
  failed = true;
} else if (!makeIpa.includes("embedded.mobileprovision")) {
  console.error("[ios-check] ios-make-ipa.sh must verify embedded.mobileprovision");
  failed = true;
} else {
  console.log("[ios-check] IPA provisioning checks OK");
}
if (!wf.includes("embedded.mobileprovision")) {
  console.error("[ios-check] workflow must verify embedded.mobileprovision before upload");
  failed = true;
} else {
  console.log("[ios-check] workflow ITMS-90174 guard OK");
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

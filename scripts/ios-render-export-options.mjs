#!/usr/bin/env node
/**
 * Render ios-ci/ExportOptions.plist with APPLE_TEAM_ID / PROVISIONING_PROFILE_NAME.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "ios-ci", "ExportOptions.plist");
const destArg = process.argv[2];
const dest = destArg
  ? path.resolve(destArg)
  : path.join(root, "ios", "ExportOptions.plist");

const teamId = process.env.APPLE_TEAM_ID || "";
const profileName = process.env.PROVISIONING_PROFILE_NAME || "TiSLY App Store";

if (!teamId) {
  console.error("[ios-render-export-options] ERROR: APPLE_TEAM_ID is required");
  process.exit(1);
}

let xml = fs.readFileSync(src, "utf8");
xml = xml.replace(/\$\(APPLE_TEAM_ID\)/g, teamId);
xml = xml.replace(/\$\(PROVISIONING_PROFILE_NAME\)/g, profileName);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, xml, "utf8");
console.log(`[ios-render-export-options] Wrote ${dest}`);

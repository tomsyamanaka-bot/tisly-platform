#!/usr/bin/env node
/**
 * Patch ios/App/App/Info.plist with camera / push / local-network usage strings.
 * Safe to re-run (idempotent key upsert via plutil when available, else XML insert).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const plistPath = path.join(root, "ios", "App", "App", "Info.plist");

const STRING_KEYS = {
  NSCameraUsageDescription:
    "現場の現調・完了報告写真の撮影およびQRコード読取に使用します。",
  NSPhotoLibraryUsageDescription:
    "現場写真の選択・添付に使用します。",
  NSPhotoLibraryAddUsageDescription:
    "撮影した現場写真をフォトライブラリへ保存するために使用します。",
  NSMicrophoneUsageDescription:
    "現場メモの音声入力に使用します。",
  NSLocalNetworkUsageDescription:
    "現場LAN上の機器（RP2350・QNAP・PLCゲートウェイ等）との通信に使用します。",
};

function fail(msg) {
  console.error(`[ios-patch-info-plist] ERROR: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[ios-patch-info-plist] ${msg}`);
}

if (!fs.existsSync(plistPath)) {
  fail(`Info.plist not found: ${plistPath} (run npx cap add ios on macOS/CI first)`);
}

const hasPlutil = spawnSync("plutil", ["-help"], { encoding: "utf8" }).status === 0;

if (hasPlutil) {
  for (const [key, value] of Object.entries(STRING_KEYS)) {
    const r = spawnSync(
      "plutil",
      ["-replace", key, "-string", value, plistPath],
      { encoding: "utf8" }
    );
    if (r.status !== 0) {
      const ins = spawnSync(
        "plutil",
        ["-insert", key, "-string", value, plistPath],
        { encoding: "utf8" }
      );
      if (ins.status !== 0) {
        fail(`Failed to set ${key}: ${ins.stderr || r.stderr}`);
      }
    }
  }

  // NSBonjourServices (array)
  spawnSync("plutil", ["-remove", "NSBonjourServices", plistPath]);
  let r = spawnSync("plutil", ["-insert", "NSBonjourServices", "-json", '["_http._tcp","_https._tcp"]', plistPath], {
    encoding: "utf8",
  });
  if (r.status !== 0) fail(`NSBonjourServices: ${r.stderr}`);

  // UIBackgroundModes for remote push
  spawnSync("plutil", ["-remove", "UIBackgroundModes", plistPath]);
  r = spawnSync(
    "plutil",
    ["-insert", "UIBackgroundModes", "-json", '["remote-notification"]', plistPath],
    { encoding: "utf8" }
  );
  if (r.status !== 0) fail(`UIBackgroundModes: ${r.stderr}`);

  // Allow local networking (LAN devices / cleartext on LAN)
  spawnSync("plutil", ["-remove", "NSAppTransportSecurity", plistPath]);
  r = spawnSync(
    "plutil",
    [
      "-insert",
      "NSAppTransportSecurity",
      "-json",
      JSON.stringify({ NSAllowsLocalNetworking: true }),
      plistPath,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) fail(`NSAppTransportSecurity: ${r.stderr}`);

  log(`Patched via plutil: ${plistPath}`);
  process.exit(0);
}

// Fallback XML patch (Windows / no plutil) — for review only; CI uses plutil on macOS
let xml = fs.readFileSync(plistPath, "utf8");
if (!xml.includes("</dict>")) fail("Unexpected Info.plist format");

function upsertString(doc, key, value) {
  const re = new RegExp(`<key>${key}</key>\\s*<string>[^<]*</string>`);
  const block = `<key>${key}</key>\n\t<string>${value}</string>`;
  if (re.test(doc)) return doc.replace(re, block);
  return doc.replace("</dict>\n</plist>", `\t${block}\n</dict>\n</plist>`);
}

for (const [key, value] of Object.entries(STRING_KEYS)) {
  xml = upsertString(xml, key, value);
}

if (!xml.includes("NSBonjourServices")) {
  xml = xml.replace(
    "</dict>\n</plist>",
    `\t<key>NSBonjourServices</key>
\t<array>
\t\t<string>_http._tcp</string>
\t\t<string>_https._tcp</string>
\t</array>
</dict>\n</plist>`
  );
}
if (!xml.includes("UIBackgroundModes")) {
  xml = xml.replace(
    "</dict>\n</plist>",
    `\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>remote-notification</string>
\t</array>
</dict>\n</plist>`
  );
}
if (!xml.includes("NSAppTransportSecurity")) {
  xml = xml.replace(
    "</dict>\n</plist>",
    `\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsLocalNetworking</key>
\t\t<true/>
\t</dict>
</dict>\n</plist>`
  );
}

fs.writeFileSync(plistPath, xml, "utf8");
log(`Patched via XML fallback: ${plistPath}`);

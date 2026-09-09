#!/usr/bin/env node
/**
 * 手動署名用: Secrets の p12 と
 * プロビジョニングプロファイルを
 * ランナーへ取り込む。
 *
 * ASC での証明書新規作成
 * （POST /v1/certificates）は行わない。
 * Invalid Certificate / 上限3枚を回避する。
 *
 * 必須 env:
 *   IOS_DIST_CERT_P12_BASE64
 *   IOS_DIST_CERT_PASSWORD
 *   IOS_PROVISIONING_PROFILE_BASE64
 *   APPLE_TEAM_ID
 *
 * 任意:
 *   IOS_PROFILE_NAME
 *   EXPORT_PLIST
 *   IOS_BUNDLE_ID（既定 jp.tisly.app）
 *   AUTH_KEY_PATH / APP_STORE_*（アップロード用）
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";

const teamId = process.env.APPLE_TEAM_ID;
const bundleId = process.env.IOS_BUNDLE_ID || "jp.tisly.app";
const exportPlist = process.env.EXPORT_PLIST;
const p12B64 = (process.env.IOS_DIST_CERT_P12_BASE64 || "").replace(/\s/g, "");
const p12Pass = process.env.IOS_DIST_CERT_PASSWORD || "";
const profileB64Env = (process.env.IOS_PROVISIONING_PROFILE_BASE64 || "").replace(
  /\s/g,
  ""
);
const profileNameOverride = (process.env.IOS_PROFILE_NAME || "").trim();

function die(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!teamId) die("APPLE_TEAM_ID required");

// p12 未設定なら即失敗
// （証明書自動作成は廃止済み）
if (!p12B64) {
  die(
    "IOS_DIST_CERT_P12_BASE64 が未設定です。" +
      "Apple Distribution の .p12 を Secrets に登録してください。" +
      "docs/IOS_SECRETS_SETUP.md を参照。"
  );
}
// プロファイルも Secrets 必須
// （ASC 新規作成・取得に依存しない）
if (!profileB64Env) {
  die(
    "IOS_PROVISIONING_PROFILE_BASE64 が未設定です。" +
      "App Store 用 .mobileprovision を base64 で登録してください。" +
      "docs/IOS_SECRETS_SETUP.md を参照。"
  );
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(r.stdout);
    console.error(r.stderr);
    die(`${cmd} ${args.join(" ")} failed (${r.status})`);
  }
  return r;
}

// login keychain を解放し codesign から使えるようにする
function unlockKeychain() {
  run("security", ["unlock-keychain", "-p", "", "login.keychain-db"], {
    allowFail: true,
  });
  run(
    "security",
    [
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:,codesign:",
      "-s",
      "-k",
      "",
      "login.keychain-db",
    ],
    { allowFail: true }
  );
}

function findDistIdentity() {
  const id = run("security", ["find-identity", "-v", "-p", "codesigning"], {
    allowFail: true,
  });
  const out = `${id.stdout || ""}\n${id.stderr || ""}`;
  console.log(out);
  return /Apple Distribution|iPhone Distribution/.test(out);
}

function plistBuddyPrint(plistPath, key) {
  const r = run("/usr/libexec/PlistBuddy", ["-c", `Print ${key}`, plistPath], {
    allowFail: true,
  });
  return (r.stdout || "").trim();
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-sign-"));
console.log("手動署名準備 (P12 + プロファイル) in", tmp);
unlockKeychain();

console.log("===== codesigning identities (before) =====");
findDistIdentity();

// --- Distribution p12 を keychain へ取り込み ---
console.log("IOS_DIST_CERT_P12_BASE64 を login.keychain へ import");
const p12Path = path.join(tmp, "dist.p12");
fs.writeFileSync(p12Path, Buffer.from(p12B64, "base64"));
run("security", [
  "import",
  p12Path,
  "-k",
  "login.keychain-db",
  "-P",
  p12Pass,
  "-T",
  "/usr/bin/codesign",
  "-T",
  "/usr/bin/security",
  "-T",
  "/usr/bin/productbuild",
]);
unlockKeychain();

console.log("===== codesigning identities after P12 =====");
if (!findDistIdentity()) {
  die(
    "p12 import 後も Apple Distribution が見つかりません。" +
      "証明書種別と IOS_DIST_CERT_PASSWORD を確認してください。"
  );
}

// --- App Store プロファイルを配置 ---
console.log("IOS_PROVISIONING_PROFILE_BASE64 を配置");
const profileBuf = Buffer.from(profileB64Env, "base64");
const profileSource = "secret";

const provFile = path.join(tmp, "prov.mobileprovision");
fs.writeFileSync(provFile, profileBuf);
const decodedXml = run("security", ["cms", "-D", "-i", provFile]).stdout;

const decodedPlist = path.join(tmp, "prov.plist");
fs.writeFileSync(decodedPlist, decodedXml);
const profileName =
  profileNameOverride ||
  plistBuddyPrint(decodedPlist, ":Name") ||
  "TiSLY App Store";
const profileUuid = plistBuddyPrint(decodedPlist, ":UUID");
if (!profileUuid) {
  die("プロファイルから UUID を読めません。base64 が壊れていないか確認してください。");
}

const appIdName = plistBuddyPrint(
  decodedPlist,
  ":Entitlements:application-identifier"
);
console.log(
  "Profile Name=",
  profileName,
  "UUID=",
  profileUuid,
  "AppID=",
  appIdName
);
if (
  appIdName &&
  !appIdName.endsWith(`.${bundleId}`) &&
  !appIdName.includes(bundleId)
) {
  console.warn(
    `::warning::プロファイル AppID (${appIdName}) が bundle ${bundleId} と不一致の可能性があります`
  );
}

const provDir = path.join(
  os.homedir(),
  "Library/MobileDevice/Provisioning Profiles"
);
fs.mkdirSync(provDir, { recursive: true });
const installed = path.join(provDir, `${profileUuid}.mobileprovision`);
fs.writeFileSync(installed, profileBuf);
fs.writeFileSync(path.join(tmp, `${profileUuid}.mobileprovision`), profileBuf);
console.log("Installed profile", profileName, "->", installed);

// Manual ExportOptions（archive / exportArchive で共通利用）
if (exportPlist) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store</string>
	<key>destination</key>
	<string>export</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>teamID</key>
	<string>${teamId}</string>
	<key>signingCertificate</key>
	<string>Apple Distribution</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>${bundleId}</key>
		<string>${profileName}</string>
	</dict>
	<key>uploadSymbols</key>
	<true/>
	<key>compileBitcode</key>
	<false/>
	<key>stripSwiftSymbols</key>
	<true/>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
</dict>
</plist>
`;
  fs.mkdirSync(path.dirname(exportPlist), { recursive: true });
  fs.writeFileSync(exportPlist, plist);
  console.log("Wrote Manual ExportOptions.plist");
  run("/usr/bin/plutil", ["-p", exportPlist], { allowFail: true });
}

const out = {
  profileName,
  profileUuid,
  bundleId,
  profileSource,
  mode: "manual_p12",
};
fs.writeFileSync(path.join(tmp, "result.json"), JSON.stringify(out, null, 2));
console.log("ASC_PREPARE_OK", JSON.stringify(out));
console.log(`PROFILE_NAME=${profileName}`);
console.log(`PROFILE_UUID=${profileUuid}`);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(
    process.env.GITHUB_ENV,
    `IOS_PROFILE_NAME=${profileName}\nIOS_PROFILE_UUID=${profileUuid}\nIOS_SIGNING_STYLE=Manual\n`
  );
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `profile_name=${profileName}\nprofile_uuid=${profileUuid}\n`
  );
}

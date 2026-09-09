#!/usr/bin/env node
/**
 * Import manually provided Apple Distribution .p12 + App Store profile for CI Manual signing.
 *
 * Does NOT create IOS_DISTRIBUTION certificates via ASC (avoids Invalid Certificate /
 * Admin / max-3 failures). Certificate private key must come from Secrets.
 *
 * Required env:
 *   IOS_DIST_CERT_P12_BASE64, IOS_DIST_CERT_PASSWORD
 *   APPLE_TEAM_ID
 *   AUTH_KEY_PATH, APP_STORE_KEY_ID, APP_STORE_ISSUER_ID (for optional ASC profile download)
 *
 * Profile (one of):
 *   IOS_PROVISIONING_PROFILE_BASE64  — preferred (.mobileprovision base64)
 *   or download an existing IOS_APP_STORE profile for IOS_BUNDLE_ID via ASC (no create)
 *
 * Optional:
 *   IOS_PROFILE_NAME — ExportOptions / PROVISIONING_PROFILE_SPECIFIER override
 *   EXPORT_PLIST — rewrite Manual ExportOptions
 *   IOS_BUNDLE_ID — default jp.tisly.app
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";

const keyPath = process.env.AUTH_KEY_PATH;
const keyId = process.env.APP_STORE_KEY_ID;
const issuerId = process.env.APP_STORE_ISSUER_ID;
const teamId = process.env.APPLE_TEAM_ID;
const bundleId = process.env.IOS_BUNDLE_ID || "jp.tisly.app";
const exportPlist = process.env.EXPORT_PLIST;
const p12B64 = (process.env.IOS_DIST_CERT_P12_BASE64 || "").replace(/\s/g, "");
const p12Pass = process.env.IOS_DIST_CERT_PASSWORD || "";
const profileB64Env = (process.env.IOS_PROVISIONING_PROFILE_BASE64 || "").replace(/\s/g, "");
const profileNameOverride = (process.env.IOS_PROFILE_NAME || "").trim();

function die(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!teamId) die("APPLE_TEAM_ID required");
if (!p12B64) {
  die(
    "IOS_DIST_CERT_P12_BASE64 is required. CI no longer creates Distribution certificates. Export Apple Distribution .p12 from Keychain Access and set Secrets IOS_DIST_CERT_P12_BASE64 + IOS_DIST_CERT_PASSWORD (see docs/IOS_SECRETS_SETUP.md)."
  );
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt() {
  if (!keyPath || !fs.existsSync(keyPath) || !keyId || !issuerId) {
    return null;
  }
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: "appstoreconnect-v1",
  };
  const enc = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const sig = crypto.sign("sha256", Buffer.from(enc), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${enc}.${b64url(sig)}`;
}

async function asc(method, urlPath, body) {
  const token = makeJwt();
  if (!token) die("ASC API key env missing (AUTH_KEY_PATH / APP_STORE_KEY_ID / APP_STORE_ISSUER_ID)");
  const res = await fetch(`https://api.appstoreconnect.apple.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    console.error("ASC error", res.status, urlPath, JSON.stringify(json)?.slice(0, 2000));
    const err = new Error(`ASC ${method} ${urlPath} -> ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-asc-"));
console.log("Manual signing prep (P12 + existing profile) in", tmp);
unlockKeychain();

console.log("===== codesigning identities (before) =====");
findDistIdentity();

// --- Import Distribution .p12 (required; no CSR / no ASC cert create) ---
console.log("Importing IOS_DIST_CERT_P12_BASE64 into login keychain");
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

console.log("===== codesigning identities after P12 import =====");
if (!findDistIdentity()) {
  die(
    "P12 imported but no Apple Distribution identity found. Confirm the .p12 contains an Apple Distribution certificate + private key and IOS_DIST_CERT_PASSWORD is correct."
  );
}

// --- Install provisioning profile ---
let profileBuf = null;
let profileSource = "";

if (profileB64Env) {
  console.log("Using IOS_PROVISIONING_PROFILE_BASE64 secret");
  profileBuf = Buffer.from(profileB64Env, "base64");
  profileSource = "secret";
} else {
  console.log("No IOS_PROVISIONING_PROFILE_BASE64 — downloading existing App Store profile via ASC");
  try {
    const listed = await asc(
      "GET",
      "/v1/profiles?filter[profileType]=IOS_APP_STORE&filter[profileState]=ACTIVE&limit=200"
    );
    const profiles = listed.data || [];
    console.log(`ASC App Store profiles: ${profiles.length}`);

    // Prefer name match / bundle via relationships when possible
    let chosen =
      profiles.find((p) =>
        String(p.attributes?.name || "")
          .toLowerCase()
          .includes("tisly")
      ) || null;

    if (!chosen) {
      for (const p of profiles) {
        try {
          const detail = await asc(
            "GET",
            `/v1/profiles/${p.id}/relationships/bundleId`
          );
          const bid = detail?.data?.id;
          if (!bid) continue;
          const b = await asc("GET", `/v1/bundleIds/${bid}`);
          if (b?.data?.attributes?.identifier === bundleId) {
            chosen = p;
            break;
          }
        } catch {
          /* continue */
        }
      }
    }

    if (!chosen) chosen = profiles[0] || null;
    if (!chosen) {
      die(
        `No active IOS_APP_STORE profile on ASC for ${bundleId}. Create one in Apple Developer (App Store) for the same Distribution cert as your P12, or set Secret IOS_PROVISIONING_PROFILE_BASE64.`
      );
    }

    // Re-fetch full profile to ensure profileContent is present
    const full = await asc("GET", `/v1/profiles/${chosen.id}`);
    const content = full?.data?.attributes?.profileContent;
    if (!content) {
      die("ASC profile missing profileContent");
    }
    profileBuf = Buffer.from(content, "base64");
    profileSource = `asc:${chosen.id}:${full.data.attributes.name}`;
    console.log("Selected ASC profile", profileSource);
  } catch (e) {
    const detail = JSON.stringify(e.body || e.message || e).slice(0, 1500);
    die(
      `Failed to download existing App Store profile via ASC. Set Secret IOS_PROVISIONING_PROFILE_BASE64 instead. Detail: ${detail}`
    );
  }
}

const decodedXml = (() => {
  const p = path.join(tmp, "prov.mobileprovision");
  fs.writeFileSync(p, profileBuf);
  const r = run("security", ["cms", "-D", "-i", p], { allowFail: false });
  return r.stdout;
})();

const decodedPlist = path.join(tmp, "prov.plist");
fs.writeFileSync(decodedPlist, decodedXml);
const profileName =
  profileNameOverride ||
  plistBuddyPrint(decodedPlist, ":Name") ||
  "TiSLY App Store";
const profileUuid = plistBuddyPrint(decodedPlist, ":UUID");
if (!profileUuid) die("Could not read UUID from provisioning profile");

const appIdName = plistBuddyPrint(
  decodedPlist,
  ":Entitlements:application-identifier"
);
console.log("Profile Name=", profileName, "UUID=", profileUuid, "AppID=", appIdName);
if (appIdName && !appIdName.endsWith(`.${bundleId}`) && !appIdName.includes(bundleId)) {
  console.warn(
    `::warning::Profile application-identifier (${appIdName}) may not match bundle ${bundleId}`
  );
}

const provDir = path.join(
  os.homedir(),
  "Library/MobileDevice/Provisioning Profiles"
);
fs.mkdirSync(provDir, { recursive: true });
const installed = path.join(provDir, `${profileUuid}.mobileprovision`);
fs.writeFileSync(installed, profileBuf);
// Also keep a copy named for debugging
fs.writeFileSync(path.join(tmp, `${profileUuid}.mobileprovision`), profileBuf);
console.log("Installed profile", profileName, "->", installed, "source=", profileSource);

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

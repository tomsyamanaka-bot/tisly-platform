#!/usr/bin/env node
/**
 * Prepare Apple Distribution cert + App Store provisioning profile via ASC API,
 * import into login keychain / MobileDevice profiles for xcodebuild -exportArchive.
 *
 * Env:
 *   AUTH_KEY_PATH, APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APPLE_TEAM_ID
 *   IOS_BUNDLE_ID (default jp.tisly.app)
 *   EXPORT_PLIST (path to ExportOptions.plist to rewrite for manual signing)
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

function die(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!keyPath || !fs.existsSync(keyPath)) die("AUTH_KEY_PATH missing");
if (!keyId || !issuerId || !teamId) die("APP_STORE_KEY_ID / ISSUER_ID / APPLE_TEAM_ID required");

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt() {
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

function writePlistBuddy(plist, commands) {
  for (const c of commands) {
    run("/usr/libexec/PlistBuddy", ["-c", c, plist], { allowFail: true });
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-asc-"));
console.log("ASC signing prep in", tmp);

// --- Certificates (Apple Distribution = IOS_DISTRIBUTION) ---
const certs = await asc(
  "GET",
  "/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=50"
);
let certItem = (certs.data || [])[0];
let keyPemPath = null;

if (!certItem) {
  console.log("No IOS_DISTRIBUTION cert — creating via CSR");
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  keyPemPath = path.join(tmp, "dist.key");
  fs.writeFileSync(
    keyPemPath,
    privateKey.export({ type: "pkcs8", format: "pem" })
  );
  const csrPath = path.join(tmp, "dist.csr");
  const r = spawnSync(
    "openssl",
    [
      "req",
      "-new",
      "-key",
      keyPemPath,
      "-out",
      csrPath,
      "-subj",
      "/CN=TiSLY CI Distribution/O=TiSLY/C=JP",
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) die(r.stderr || "openssl csr failed");
  const csrPem = fs.readFileSync(csrPath, "utf8");
  const csrB64 = Buffer.from(csrPem).toString("base64");
  try {
    const created = await asc("POST", "/v1/certificates", {
      data: {
        type: "certificates",
        attributes: {
          certificateType: "IOS_DISTRIBUTION",
          csrContent: csrB64,
        },
      },
    });
    certItem = created.data;
  } catch (e) {
    console.error(
      "Certificate create failed — API key needs Admin (or Account Holder) to create IOS_DISTRIBUTION certs"
    );
    throw e;
  }
} else {
  console.log("Found existing IOS_DISTRIBUTION cert", certItem.id);
}


const certContent = certItem.attributes.certificateContent;
const cerPath = path.join(tmp, "dist.cer");
fs.writeFileSync(cerPath, Buffer.from(certContent, "base64"));

// Import certificate (and key if we created it) into login keychain
run(
  "security",
  ["import", cerPath, "-k", "login.keychain-db", "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"],
  { allowFail: true }
);
if (keyPemPath && fs.existsSync(keyPemPath)) {
  // Convert key+cert to p12 for reliable import
  const p12Path = path.join(tmp, "dist.p12");
  const p12Pass = "tisly-ci";
  const pemCert = path.join(tmp, "dist.pem");
  run("openssl", ["x509", "-inform", "DER", "-in", cerPath, "-out", pemCert]);
  run("openssl", [
    "pkcs12",
    "-export",
    "-inkey",
    keyPemPath,
    "-in",
    pemCert,
    "-out",
    p12Path,
    "-passout",
    `pass:${p12Pass}`,
  ]);
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
  ]);
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

console.log("===== codesigning identities after cert import =====");
run("security", ["find-identity", "-v", "-p", "codesigning"], { allowFail: true });

// --- Bundle ID ---
let bundleResource;
{
  const q = encodeURIComponent(bundleId);
  const listed = await asc(
    "GET",
    `/v1/bundleIds?filter[identifier]=${q}&limit=5`
  );
  bundleResource = (listed.data || [])[0];
  if (!bundleResource) {
    console.log("Creating bundle id", bundleId);
    const created = await asc("POST", "/v1/bundleIds", {
      data: {
        type: "bundleIds",
        attributes: {
          identifier: bundleId,
          name: "TiSLY",
          platform: "IOS",
        },
      },
    });
    bundleResource = created.data;
  }
  console.log("Bundle ID resource", bundleResource.id, bundleResource.attributes.identifier);
}

// --- Profiles (IOS_APP_STORE) ---
const profiles = await asc(
  "GET",
  `/v1/profiles?filter[profileType]=IOS_APP_STORE&filter[profileState]=ACTIVE&limit=50`
);
let profile = (profiles.data || []).find(
  (p) =>
    (p.attributes?.name || "").includes("TiSLY") ||
    (p.attributes?.uuid && false)
);

// Prefer profile linked to our bundle — fetch each if needed
if (!profile) {
  // create new profile with cert + bundle
  console.log("Creating IOS_APP_STORE profile");
  try {
    const created = await asc("POST", "/v1/profiles", {
      data: {
        type: "profiles",
        attributes: {
          name: `TiSLY AppStore ${Date.now()}`,
          profileType: "IOS_APP_STORE",
        },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: bundleResource.id } },
          certificates: {
            data: [{ type: "certificates", id: certItem.id }],
          },
        },
      },
    });
    profile = created.data;
  } catch (e) {
    console.error("Profile create failed — listing existing profiles");
    profile = (profiles.data || [])[0];
    if (!profile) throw e;
  }
}

const profileName = profile.attributes.name;
const profileB64 = profile.attributes.profileContent;
const mobileprovision = path.join(tmp, `${profile.attributes.uuid}.mobileprovision`);
fs.writeFileSync(mobileprovision, Buffer.from(profileB64, "base64"));

const provDir = path.join(
  os.homedir(),
  "Library/MobileDevice/Provisioning Profiles"
);
fs.mkdirSync(provDir, { recursive: true });
const installed = path.join(provDir, `${profile.attributes.uuid}.mobileprovision`);
fs.copyFileSync(mobileprovision, installed);
console.log("Installed profile", profileName, "->", installed);

if (exportPlist && fs.existsSync(exportPlist)) {
  // Rewrite ExportOptions for manual signing with this profile
  writePlistBuddy(exportPlist, [
    "Set :method app-store-connect",
    "Set :destination export",
    "Set :signingStyle manual",
    `Set :teamID ${teamId}`,
    "Delete :signingCertificate",
    "Add :signingCertificate string Apple Distribution",
    "Delete :provisioningProfiles",
    "Add :provisioningProfiles dict",
    `Add :provisioningProfiles:${bundleId} string ${profileName}`,
  ]);
  // PlistBuddy Add for nested keys can be finicky — write file directly
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
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
  fs.writeFileSync(exportPlist, plist);
  console.log("Wrote manual ExportOptions.plist");
  run("/usr/bin/plutil", ["-p", exportPlist], { allowFail: true });
}

const out = {
  profileName,
  profileUuid: profile.attributes.uuid,
  certId: certItem.id,
  bundleId,
};
fs.writeFileSync(path.join(tmp, "result.json"), JSON.stringify(out, null, 2));
console.log("ASC_PREPARE_OK", JSON.stringify(out));
console.log(`PROFILE_NAME=${profileName}`);

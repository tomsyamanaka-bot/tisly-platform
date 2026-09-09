#!/usr/bin/env node
/**
 * Prepare Apple Distribution cert + App Store profile via ASC API,
 * import into login keychain / MobileDevice profiles for Manual signing.
 *
 * Xcode 26 Automatic Signing on GHA produces unsigned archives
 * ("code object is not signed at all"). CI therefore uses Manual +
 * -allowProvisioningUpdates + ASC API key auth for archive/export.
 *
 * Env:
 *   AUTH_KEY_PATH, APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APPLE_TEAM_ID
 *   IOS_BUNDLE_ID (default jp.tisly.app)
 *   EXPORT_PLIST (path to ExportOptions.plist — rewritten for Manual)
 *   IOS_DIST_CERT_P12_BASE64 / IOS_DIST_CERT_PASSWORD (optional)
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-asc-"));
console.log("ASC signing prep in", tmp);
unlockKeychain();

console.log("===== codesigning identities (before) =====");
findDistIdentity();

let certItem = null;
let keyPemPath = null;
const p12B64 = process.env.IOS_DIST_CERT_P12_BASE64 || "";
const p12PassEnv = process.env.IOS_DIST_CERT_PASSWORD || "";

if (p12B64) {
  console.log("Importing IOS_DIST_CERT_P12_BASE64 into login keychain");
  const p12Path = path.join(tmp, "provided.p12");
  fs.writeFileSync(p12Path, Buffer.from(p12B64.replace(/\s/g, ""), "base64"));
  run("security", [
    "import",
    p12Path,
    "-k",
    "login.keychain-db",
    "-P",
    p12PassEnv,
    "-T",
    "/usr/bin/codesign",
    "-T",
    "/usr/bin/security",
  ]);
  unlockKeychain();
  const certsAfterP12 = await asc(
    "GET",
    "/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=50"
  );
  certItem = (certsAfterP12.data || [])[0];
  if (!certItem) {
    die(
      "P12 imported but no IOS_DISTRIBUTION certificate found on App Store Connect for profile creation"
    );
  }
} else {
  // Always create a CSR-backed Distribution cert so the private key is on this runner.
  // Reusing an ASC cert without its private key yields unsigned archives.
  const certs = await asc(
    "GET",
    "/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=50"
  );
  const existing = certs.data || [];
  console.log(`Existing IOS_DISTRIBUTION certs: ${existing.length}`);

  // Free a slot if at Apple's limit (3)
  if (existing.length >= 3) {
    console.log("At Distribution cert limit — revoking oldest to free a slot for CI");
    const sorted = [...existing].sort((a, b) =>
      String(a.attributes?.expirationDate || "").localeCompare(
        String(b.attributes?.expirationDate || "")
      )
    );
    const toRevoke = sorted[0];
    try {
      await asc("DELETE", `/v1/certificates/${toRevoke.id}`);
      console.log("Revoked certificate", toRevoke.id);
    } catch (e) {
      console.error("Revoke failed", e.body || e.message);
      die(
        "Cannot create Distribution cert (max 3). Set Secrets IOS_DIST_CERT_P12_BASE64 + IOS_DIST_CERT_PASSWORD, or revoke a cert manually."
      );
    }
  }

  console.log("Creating new IOS_DISTRIBUTION cert via CSR (private key stays on runner)");
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
  const csrB64 = Buffer.from(fs.readFileSync(csrPath)).toString("base64");
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
    const detail = JSON.stringify(e.body || e.message || e).slice(0, 1500);
    die(
      `Failed to create IOS_DISTRIBUTION certificate. Need Admin ASC API key; or set Secrets IOS_DIST_CERT_P12_BASE64 + IOS_DIST_CERT_PASSWORD. Detail: ${detail}`
    );
  }
}

const certContent = certItem.attributes.certificateContent;
const cerPath = path.join(tmp, "dist.cer");
fs.writeFileSync(cerPath, Buffer.from(certContent, "base64"));

run(
  "security",
  [
    "import",
    cerPath,
    "-k",
    "login.keychain-db",
    "-T",
    "/usr/bin/codesign",
    "-T",
    "/usr/bin/security",
  ],
  { allowFail: true }
);

if (keyPemPath && fs.existsSync(keyPemPath)) {
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
  unlockKeychain();
}

console.log("===== codesigning identities after cert import =====");
if (!findDistIdentity()) {
  die(
    "No Apple Distribution identity in keychain after ASC prepare — cannot Manual-sign. Provide IOS_DIST_CERT_P12_BASE64 or fix ASC Admin API key."
  );
}

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
  console.log(
    "Bundle ID resource",
    bundleResource.id,
    bundleResource.attributes.identifier
  );
}

// Always create a fresh App Store profile bound to THIS cert (avoids cert/profile mismatch)
const profileName = `TiSLY AppStore ${Date.now()}`;
console.log("Creating IOS_APP_STORE profile", profileName);
let profile;
try {
  const created = await asc("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: {
        name: profileName,
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
  const detail = JSON.stringify(e.body || e.message || e).slice(0, 1500);
  die(`Failed to create IOS_APP_STORE profile. Detail: ${detail}`);
}

const profileUuid = profile.attributes.uuid;
const profileB64 = profile.attributes.profileContent;
const mobileprovision = path.join(tmp, `${profileUuid}.mobileprovision`);
fs.writeFileSync(mobileprovision, Buffer.from(profileB64, "base64"));

const provDir = path.join(
  os.homedir(),
  "Library/MobileDevice/Provisioning Profiles"
);
fs.mkdirSync(provDir, { recursive: true });
const installed = path.join(provDir, `${profileUuid}.mobileprovision`);
fs.copyFileSync(mobileprovision, installed);
console.log("Installed profile", profile.attributes.name, "->", installed);

const finalProfileName = profile.attributes.name;

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
		<string>${finalProfileName}</string>
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
  profileName: finalProfileName,
  profileUuid,
  certId: certItem.id,
  bundleId,
};
fs.writeFileSync(path.join(tmp, "result.json"), JSON.stringify(out, null, 2));
console.log("ASC_PREPARE_OK", JSON.stringify(out));
console.log(`PROFILE_NAME=${finalProfileName}`);
console.log(`PROFILE_UUID=${profileUuid}`);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(
    process.env.GITHUB_ENV,
    `IOS_PROFILE_NAME=${finalProfileName}\nIOS_PROFILE_UUID=${profileUuid}\nIOS_SIGNING_STYLE=Manual\n`
  );
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `profile_name=${finalProfileName}\nprofile_uuid=${profileUuid}\n`
  );
}

#!/usr/bin/env node
/**
 * TiSLY Android TWA build — Bubblewrap update + AAB generation.
 * Usage: node scripts/build-android.mjs [--skip-signing]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  KEY_ALIAS,
  RELEASE_KEYSTORE_FILE,
  findJdkHome as findSharedJdkHome,
  getSigningPassword,
  releaseKeystorePath,
} from "./android-keystore-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const androidDir = path.join(root, "android");
const publicDir = path.join(root, "server", "public");
const manifestPath = path.join(androidDir, "twa-manifest.json");

function log(msg) {
  console.log(`[build:android] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[build:android] ERROR: ${msg}`);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || androidDir,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    fail(`${cmd} exited with ${r.status}`);
  }
}

function findJdkHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  const hit = findSharedJdkHome(androidDir);
  if (hit) return hit;
  const parents = [
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Java",
  ];
  for (const parent of parents) {
    if (!fs.existsSync(parent)) continue;
    const jdkHit = fs
      .readdirSync(parent)
      .filter((n) => /jdk-?17/i.test(n) || /^jdk/i.test(n))
      .map((n) => path.join(parent, n))
      .find(
        (p) =>
          fs.existsSync(path.join(p, "bin", "java.exe")) ||
          fs.existsSync(path.join(p, "bin", "java"))
      );
    if (jdkHit) return jdkHit;
  }
  return null;
}

function ensureReleaseKeystore() {
  const ks = releaseKeystorePath(androidDir);
  if (fs.existsSync(ks)) return ks;
  log("Creating release keystore (tisly-release-key.jks)...");
  run("node", [path.join(root, "scripts", "android-keystore.mjs")], { cwd: root });
  if (!fs.existsSync(ks)) fail(`Release keystore not found after create: ${ks}`);
  return ks;
}

function writeKeystoreProperties() {
  const propsPath = path.join(androidDir, "keystore.properties");
  const password = getSigningPassword();
  const body = [
    `storeFile=${RELEASE_KEYSTORE_FILE}`,
    `storePassword=${password}`,
    `keyAlias=${KEY_ALIAS}`,
    `keyPassword=${password}`,
    "",
  ].join("\n");
  fs.writeFileSync(propsPath, body, "utf8");
  log(`Wrote ${propsPath} (gitignored)`);
}

/** Play Protect requires minSdk >= 24; keep compile/target >= 34. */
function applyPlaySdkVersionsToAppGradle() {
  const gradlePath = path.join(androidDir, "app", "build.gradle");
  if (!fs.existsSync(gradlePath)) {
    fail(`Missing ${gradlePath} — run project generation first`);
  }
  const twa = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const minSdk = Math.max(24, Number(twa.minSdkVersion) || 24);
  const versionCode = Number(twa.appVersionCode) || 3;
  const versionName = String(twa.appVersion || "1.1.1");
  let src = fs.readFileSync(gradlePath, "utf8");
  src = src.replace(/minSdkVersion\s+\d+/, `minSdkVersion ${minSdk}`);
  src = src.replace(/\bminSdk\s+\d+/, `minSdk ${minSdk}`);
  src = src.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  src = src.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  const bumpIfLow = (re, label, replacement) => {
    const m = src.match(re);
    if (m && Number(m[1]) < 34) {
      src = src.replace(re, replacement);
      log(`Bumped ${label} from ${m[1]} to 34`);
    }
  };
  bumpIfLow(/compileSdkVersion\s+(\d+)/, "compileSdkVersion", "compileSdkVersion 34");
  bumpIfLow(/compileSdk\s+(\d+)/, "compileSdk", "compileSdk 34");
  bumpIfLow(/targetSdkVersion\s+(\d+)/, "targetSdkVersion", "targetSdkVersion 34");
  bumpIfLow(/targetSdk\s+(\d+)/, "targetSdk", "targetSdk 34");
  fs.writeFileSync(gradlePath, src, "utf8");
  log(`Applied Play SDK/version: minSdk=${minSdk} versionCode=${versionCode} versionName=${versionName}`);
}

function verifyPlaySdkVersionsInAppGradle() {
  const gradlePath = path.join(androidDir, "app", "build.gradle");
  const src = fs.readFileSync(gradlePath, "utf8");
  const minSdk = Number((src.match(/minSdkVersion\s+(\d+)/) || src.match(/\bminSdk\s+(\d+)/) || [])[1]);
  const compileSdk = Number((src.match(/compileSdkVersion\s+(\d+)/) || src.match(/\bcompileSdk\s+(\d+)/) || [])[1]);
  const targetSdk = Number((src.match(/targetSdkVersion\s+(\d+)/) || src.match(/\btargetSdk\s+(\d+)/) || [])[1]);
  const versionCode = Number((src.match(/versionCode\s+(\d+)/) || [])[1]);
  const versionName = (src.match(/versionName\s+"([^"]*)"/) || [])[1];
  if (!(minSdk >= 24)) fail(`minSdkVersion must be >= 24, got ${minSdk}`);
  if (!(compileSdk >= 34)) fail(`compileSdkVersion must be >= 34, got ${compileSdk}`);
  if (!(targetSdk >= 34)) fail(`targetSdkVersion must be >= 34, got ${targetSdk}`);
  if (versionCode !== 3) fail(`versionCode must be 3, got ${versionCode}`);
  if (versionName !== "1.1.1") fail(`versionName must be 1.1.1, got ${versionName}`);
  log(`Verified app/build.gradle minSdk=${minSdk} compileSdk=${compileSdk} targetSdk=${targetSdk} ${versionCode} (${versionName})`);
}

/**
 * Bubblewrap 生成後の app/build.gradle に
 * signingConfigs.release をマージする
 */
function applySigningToAppGradle() {
  const gradlePath = path.join(androidDir, "app", "build.gradle");
  if (!fs.existsSync(gradlePath)) {
    fail(`Missing ${gradlePath} — run project generation first`);
  }
  let src = fs.readFileSync(gradlePath, "utf8");
  if (src.includes("signingConfigs") && src.includes("signingConfig signingConfigs.release")) {
    // 古い file() パスを rootProject.file() へ修正
    if (src.includes("storeFile file(keystoreProperties")) {
      src = src.replace(
        /storeFile file\(keystoreProperties\['storeFile'\][^)]+\)/,
        `storeFile rootProject.file(keystoreProperties['storeFile'] ?: '${RELEASE_KEYSTORE_FILE}')`
      );
      fs.writeFileSync(gradlePath, src, "utf8");
      log("Fixed keystore path to rootProject.file in app/build.gradle");
    } else {
      log("app/build.gradle already has release signingConfig");
    }
    applyPlaySdkVersionsToAppGradle();
    return;
  }

  const propsBlock = `
    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }
`;

  if (!src.includes("keystorePropertiesFile")) {
    src = src.replace(/^android \{\n/m, `android {\n${propsBlock}`);
  }

  const signingBlock = `
    signingConfigs {
        release {
            storeFile rootProject.file(keystoreProperties['storeFile'] ?: '${RELEASE_KEYSTORE_FILE}')
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
`;

  if (!src.includes("signingConfigs")) {
    src = src.replace(/\n    buildTypes \{/m, `${signingBlock}\n    buildTypes {`);
  }

  if (!src.includes("signingConfig signingConfigs.release")) {
    src = src.replace(
      /release \{\n(\s*)minifyEnabled true\n/m,
      "release {\n$1minifyEnabled true\n$1signingConfig signingConfigs.release\n"
    );
  }

  fs.writeFileSync(gradlePath, src, "utf8");
  log("Applied signingConfigs.release to app/build.gradle");
  applyPlaySdkVersionsToAppGradle();
}

function verifyAabSigned(aabPath) {
  const jdk = process.env.JAVA_HOME;
  const jarsigner =
    jdk && fs.existsSync(path.join(jdk, "bin", "jarsigner.exe"))
      ? path.join(jdk, "bin", "jarsigner.exe")
      : jdk && fs.existsSync(path.join(jdk, "bin", "jarsigner"))
        ? path.join(jdk, "bin", "jarsigner")
        : "jarsigner";

  const r = spawnSync(jarsigner, ["-verify", "-verbose", "-certs", aabPath], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0) {
    console.error(out);
    fail("AAB signature verification failed (jarsigner)");
  }
  if (/jar is unsigned/i.test(out)) {
    console.error(out);
    fail("AAB is unsigned — Play Console will reject upload");
  }
  log("AAB signature verified (jarsigner)");
}

function ensureBubblewrapConfig(jdkPath, androidSdkPath) {
  const home = process.env.USERPROFILE || process.env.HOME;
  const cfgDir = path.join(home, ".bubblewrap");
  const cfgPath = path.join(cfgDir, "config.json");
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfg = {
    jdkPath: jdkPath.replace(/\\/g, "/"),
    androidSdkPath: androidSdkPath.replace(/\\/g, "/"),
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  log(`Wrote ${cfgPath}`);
}

function ensureAndroidSdk(sdkRoot) {
  const sdkmanager =
    process.platform === "win32"
      ? path.join(sdkRoot, "bin", "sdkmanager.bat")
      : path.join(sdkRoot, "bin", "sdkmanager");
  const buildTools =
    fs.existsSync(path.join(sdkRoot, "build-tools", "35.0.0")) ||
    fs.existsSync(path.join(sdkRoot, "build-tools", "34.0.0"));
  const platform36 = fs.existsSync(path.join(sdkRoot, "platforms", "android-36", "android.jar"));

  if (fs.existsSync(sdkmanager) && buildTools && platform36) {
    log(`Android SDK already present: ${sdkRoot}`);
    return sdkRoot;
  }

  fs.mkdirSync(sdkRoot, { recursive: true });

  if (!fs.existsSync(sdkmanager)) {
    const zipPath = path.join(sdkRoot, "cmdline-tools.zip");
    const url =
      "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip";
    log("Downloading Android cmdline-tools...");
    run("curl.exe", ["-L", "-o", zipPath, url], { cwd: root });

    const extractDir = path.join(sdkRoot, "_cmdline_extract");
    fs.mkdirSync(extractDir, { recursive: true });
    run(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`,
      ],
      { cwd: root }
    );

    // Bubblewrap expects sdk root to contain bin/sdkmanager (flat cmdline-tools layout).
    const nested = path.join(extractDir, "cmdline-tools");
    if (!fs.existsSync(nested)) {
      fail("cmdline-tools zip layout unexpected");
    }
    for (const name of fs.readdirSync(nested)) {
      const from = path.join(nested, name);
      const to = path.join(sdkRoot, name);
      if (fs.existsSync(to)) {
        fs.rmSync(to, { recursive: true, force: true });
      }
      fs.renameSync(from, to);
    }
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }

  if (!fs.existsSync(sdkmanager)) {
    fail(`sdkmanager missing after extract: ${sdkmanager}`);
  }

  log("Accepting Android SDK licenses and installing build packages...");
  const yesFile = path.join(sdkRoot, "license-yes.txt");
  fs.writeFileSync(yesFile, Array(80).fill("y").join("\n") + "\n");
  const license = spawnSync(sdkmanager, [`--sdk_root=${sdkRoot}`, "--licenses"], {
    cwd: root,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME },
    input: fs.readFileSync(yesFile, "utf8"),
    shell: process.platform === "win32",
  });
  if (license.status !== 0) {
    log("License accept returned non-zero (may already be accepted); continuing");
  }
  fs.rmSync(yesFile, { force: true });

  run(
    sdkmanager,
    [
      `--sdk_root=${sdkRoot}`,
      "platform-tools",
      "platforms;android-34",
      "platforms;android-36",
      "build-tools;34.0.0",
      "build-tools;35.0.0",
    ],
    { cwd: root, env: { JAVA_HOME: process.env.JAVA_HOME } }
  );

  return sdkRoot;
}

function startLocalPublicServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let filePath = path.join(publicDir, urlPath.replace(/^\//, ""));
        if (urlPath.endsWith("/")) filePath = path.join(filePath, "index.html");
        if (!filePath.startsWith(publicDir)) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const types = {
          ".png": "image/png",
          ".json": "application/json",
          ".webmanifest": "application/manifest+json",
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript",
          ".css": "text/css",
        };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

async function regenerateProject(localBase) {
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const workManifest = {
    ...raw,
    iconUrl: `${localBase}/icons/icon-512.png`,
    maskableIconUrl: `${localBase}/icons/icon-512.png`,
    webManifestUrl: `${localBase}/manifest.webmanifest`,
  };
  const workPath = path.join(androidDir, ".twa-manifest.build.json");
  fs.writeFileSync(workPath, JSON.stringify(workManifest, null, 2) + "\n");

  const androidRequire = createRequire(path.join(androidDir, "package.json"));
  let TwaManifest;
  let TwaGenerator;
  let ConsoleLog;
  try {
    const core = androidRequire("@bubblewrap/core");
    TwaManifest = core.TwaManifest;
    TwaGenerator = core.TwaGenerator;
    ConsoleLog = core.ConsoleLog;
  } catch (e) {
    fail(
      `Cannot load @bubblewrap/core (${e.message}). Run: npm install --prefix android`
    );
  }

  const twaManifest = new TwaManifest(workManifest);
  const validationError = twaManifest.validate();
  if (validationError) fail(`Invalid twa-manifest: ${validationError}`);

  const generator = new TwaGenerator();
  const logObj = new ConsoleLog("tisly-android");
  log("Removing previous generated project files...");
  await generator.removeTwaProject(androidDir);
  log("Generating Android TWA project...");
  await generator.createTwaProject(androidDir, twaManifest, logObj);
  // Keep committed manifest as source of truth (production URLs).
  fs.writeFileSync(manifestPath, JSON.stringify(raw, null, 2) + "\n");
  fs.rmSync(workPath, { force: true });
  applyAndroidWebViewShell();
}

function applyAndroidWebViewShell() {
  const shellDir = path.join(root, "android-shell");
  const javaDir = path.join(androidDir, "app", "src", "main", "java", "com", "tisly", "app");
  const resDir = path.join(androidDir, "app", "src", "main", "res");
  const copy = (fromRel, toAbs) => {
    const from = path.join(shellDir, fromRel);
    if (!fs.existsSync(from)) fail(`Missing Android shell file: ${from}`);
    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    fs.copyFileSync(from, toAbs);
  };
  copy("java/StartActivity.java", path.join(javaDir, "StartActivity.java"));
  copy("java/WebViewShellActivity.java", path.join(javaDir, "WebViewShellActivity.java"));
  copy("res/layout/activity_start.xml", path.join(resDir, "layout", "activity_start.xml"));
  copy(
    "res/layout/activity_webview_shell.xml",
    path.join(resDir, "layout", "activity_webview_shell.xml")
  );
  copy(
    "res/values/webview_shell_strings.xml",
    path.join(resDir, "values", "webview_shell_strings.xml")
  );
  copy(
    "res/drawable/tisly_start_button.xml",
    path.join(resDir, "drawable", "tisly_start_button.xml")
  );

  const manifestFile = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
  let xml = fs.readFileSync(manifestFile, "utf8");
  if (!xml.includes("android.permission.INTERNET")) {
    xml = xml.replace(
      `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`,
      `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>`
    );
  }

  xml = xml.replace(
    /<activity android:name="LauncherActivity"[\s\S]*?<\/activity>/,
    (block) => {
      let next = block.replace(
        /\s*<intent-filter>\s*<action android:name="android.intent.action.MAIN" \/>\s*<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>/,
        ""
      );
      next = next.replace(
        /\s*<intent-filter android:autoVerify="true">[\s\S]*?<\/intent-filter>/,
        ""
      );
      return next;
    }
  );

  if (!xml.includes('android:name="StartActivity"')) {
    const extraActivities = `
        <activity android:name="StartActivity"
            android:exported="true"
            android:label="@string/launcherName"
            android:screenOrientation="portrait"
            android:theme="@android:style/Theme.Light.NoTitleBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity android:name="WebViewShellActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize"
            android:theme="@android:style/Theme.Light.NoTitleBar">
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW"/>
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE"/>
                <data android:scheme="https"
                    android:host="@string/hostName"
                />
            </intent-filter>
        </activity>
`;
    xml = xml.replace(
      `<activity android:name="LauncherActivity"`,
      `${extraActivities}\n        <activity android:name="LauncherActivity"`
    );
  }

  fs.writeFileSync(manifestFile, xml, "utf8");
  log("Applied in-app WebView shell (StartActivity → /customer)");
}

function runGradleBundle() {
  const gradlew =
    process.platform === "win32"
      ? path.join(androidDir, "gradlew.bat")
      : path.join(androidDir, "gradlew");
  if (!fs.existsSync(gradlew)) {
    fail(`Missing ${gradlew} — project generation failed`);
  }
  // local.properties for Android SDK location
  const localProps = path.join(androidDir, "local.properties");
  const sdkPath = process.env.ANDROID_SDK_ROOT.replace(/\\/g, "/");
  fs.writeFileSync(localProps, `sdk.dir=${sdkPath}\n`);

  run(gradlew, ["bundleRelease", "--no-daemon"], {
    cwd: androidDir,
    env: {
      JAVA_HOME: process.env.JAVA_HOME,
      ANDROID_HOME: process.env.ANDROID_HOME,
      ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
    },
  });
}

function copyAabArtifact() {
  const generated = path.join(
    androidDir,
    "app",
    "build",
    "outputs",
    "bundle",
    "release",
    "app-release.aab"
  );
  const dest = path.join(androidDir, "app-release-bundle.aab");
  if (!fs.existsSync(generated)) {
    fail(`AAB not found at ${generated}`);
  }
  fs.copyFileSync(generated, dest);
  return dest;
}

/** Copy AAB to Play Console upload folder + write IDE-visible marker. */
function publishAabOutputs(aabPath) {
  const st = fs.statSync(aabPath);
  if (!st.isFile() || st.size < 100_000) {
    fail(`AAB looks invalid: ${aabPath} size=${st.size}`);
  }

  const uploadDir = path.join(root, "play-console-upload");
  fs.mkdirSync(uploadDir, { recursive: true });
  const uploadAab = path.join(uploadDir, "TiSLY-com.tisly.app.aab");
  fs.copyFileSync(aabPath, uploadAab);

  const marker = [
    "TiSLY Android TWA — AAB physical output (local only; *.aab is gitignored)",
    "",
    `generatedAt: ${new Date().toISOString()}`,
    `packageId: com.tisly.app`,
    `appName: TiSLY`,
    `bytes: ${st.size}`,
    `androidAab: ${path.resolve(aabPath)}`,
    `playConsoleAab: ${path.resolve(uploadAab)}`,
    "",
    "Upload play-console-upload/TiSLY-com.tisly.app.aab to Google Play Console.",
    "Regenerate anytime: npm run build:android",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(androidDir, "AAB_READY.txt"), marker, "utf8");
  fs.writeFileSync(path.join(uploadDir, "AAB_READY.txt"), marker, "utf8");

  log(`Verified physical AAB (${st.size} bytes)`);
  log(`  → ${path.resolve(aabPath)}`);
  log(`  → ${path.resolve(uploadAab)}`);
  return { aabPath: path.resolve(aabPath), uploadAab: path.resolve(uploadAab), bytes: st.size };
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    fail(`Missing ${manifestPath}`);
  }
  if (!fs.existsSync(path.join(publicDir, "icons", "icon-512.png"))) {
    fail("Missing server/public/icons/icon-512.png");
  }

  const jdk = findJdkHome();
  if (!jdk) {
    fail(
      "JDK 17 not found. Install Microsoft OpenJDK 17 and set JAVA_HOME, then retry."
    );
  }
  process.env.JAVA_HOME = jdk;
  log(`JAVA_HOME=${jdk}`);

  const sdkRoot = path.join(root, "android", ".android-sdk");
  // Avoid spaces in SDK path (Bubblewrap requirement)
  process.env.ANDROID_HOME = sdkRoot;
  process.env.ANDROID_SDK_ROOT = sdkRoot;
  ensureAndroidSdk(sdkRoot);
  ensureBubblewrapConfig(jdk, sdkRoot);

  const { server, base } = await startLocalPublicServer();
  log(`Local asset server: ${base}`);
  try {
    await regenerateProject(base);
  } finally {
    server.close();
  }

  const skipSigning = process.argv.includes("--skip-signing");

  ensureReleaseKeystore();
  writeKeystoreProperties();
  applySigningToAppGradle();
  verifyPlaySdkVersionsInAppGradle();

  if (skipSigning) {
    log("Building unsigned AAB (--skip-signing). Not for Play Console upload.");
    runGradleBundle();
  } else {
    log("Building signed release AAB (Gradle bundleRelease + signingConfigs.release).");
    runGradleBundle();
  }

  const aab = copyAabArtifact();
  if (!skipSigning) {
    verifyAabSigned(aab);
  }

  const published = publishAabOutputs(aab);
  log(`AAB ready: ${published.aabPath}`);
  log(`Play Console upload copy: ${published.uploadAab}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

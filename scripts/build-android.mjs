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
  const parents = [
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Java",
  ];
  for (const parent of parents) {
    if (!fs.existsSync(parent)) continue;
    const hit = fs
      .readdirSync(parent)
      .filter((n) => /jdk-?17/i.test(n) || /^jdk/i.test(n))
      .map((n) => path.join(parent, n))
      .find(
        (p) =>
          fs.existsSync(path.join(p, "bin", "java.exe")) ||
          fs.existsSync(path.join(p, "bin", "java"))
      );
    if (hit) return hit;
  }
  return null;
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
}

function npxBubblewrap(args) {
  run("npx", ["--yes", "@bubblewrap/cli@1.24.1", ...args], {
    cwd: androidDir,
    env: {
      JAVA_HOME: process.env.JAVA_HOME,
      ANDROID_HOME: process.env.ANDROID_HOME,
      ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
    },
  });
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

  const skipSigning =
    process.argv.includes("--skip-signing") ||
    (!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD &&
      !process.env.BUBBLEWRAP_KEY_PASSWORD);

  if (skipSigning) {
    log("Building unsigned AAB via Gradle bundleRelease.");
    runGradleBundle();
  } else {
    log("Building signed AAB via Bubblewrap CLI...");
    // Feed "n" so Bubblewrap does not prompt to regenerate.
    const r = spawnSync(
      "npx",
      ["--yes", "@bubblewrap/cli@1.24.1", "build", "--skipPwaValidation"],
      {
        cwd: androidDir,
        env: {
          ...process.env,
          JAVA_HOME: process.env.JAVA_HOME,
          ANDROID_HOME: process.env.ANDROID_HOME,
          ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
        },
        stdio: ["pipe", "inherit", "inherit"],
        input: "n\n",
        shell: true,
      }
    );
    if (r.status !== 0) {
      fail(`bubblewrap build exited with ${r.status}`);
    }
  }

  const aab = skipSigning
    ? copyAabArtifact()
    : [
        path.join(androidDir, "app-release-bundle.aab"),
        path.join(androidDir, "app", "build", "outputs", "bundle", "release", "app-release.aab"),
      ].find((p) => fs.existsSync(p));

  if (!aab || !fs.existsSync(aab)) {
    fail("Build finished but AAB not found");
  }
  log(`AAB ready: ${aab}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

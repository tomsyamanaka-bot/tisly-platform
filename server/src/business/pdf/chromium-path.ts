import fs from "fs";
import os from "os";
import path from "path";

const LINUX_CHROMIUM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/snap/bin/chromium",
];

export function resolveChromiumExecutablePath(): string | null {
  if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) {
    const custom = process.env.PUPPETEER_EXECUTABLE_PATH.trim();
    return fs.existsSync(custom) ? custom : null;
  }

  if (process.platform === "linux") {
    for (const candidate of LINUX_CHROMIUM_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  try {
    const puppeteerPkg = path.join(process.cwd(), "node_modules", "puppeteer", "package.json");
    if (fs.existsSync(puppeteerPkg)) {
      const json = JSON.parse(fs.readFileSync(puppeteerPkg, "utf8")) as {
        puppeteer?: { chromium?: { path?: string } };
      };
      const rel = json.puppeteer?.chromium?.path;
      if (rel) {
        const full = path.join(process.cwd(), "node_modules", "puppeteer", rel);
        if (fs.existsSync(full)) return full;
      }
    }
  } catch {
    /* ignore */
  }

  const homeCache = path.join(os.homedir(), ".cache", "puppeteer");
  if (fs.existsSync(homeCache)) {
    const chromeRoots = [
      path.join(homeCache, "chrome"),
      homeCache,
    ];
    for (const root of chromeRoots) {
      if (!fs.existsSync(root)) continue;
      const bins = fs
        .readdirSync(root, { withFileTypes: true })
        .flatMap((entry) => {
          if (!entry.isDirectory()) return [];
          const candidates = [
            path.join(root, entry.name, "chrome-linux64", "chrome"),
            path.join(root, entry.name, "chrome-win64", "chrome.exe"),
            path.join(
              root,
              entry.name,
              "chrome-mac",
              "Chromium.app",
              "Contents",
              "MacOS",
              "Chromium"
            ),
          ];
          return candidates.filter((c) => fs.existsSync(c));
        });
      if (bins[0]) return bins[0];
    }
  }

  return null;
}

export const PUPPETEER_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

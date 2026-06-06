/**
 * Phase 1381–1400 — PWA インストール監査（manifest / icons / SW / meta）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

export interface PwaInstallCheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface PwaInstallAuditEntry {
  route: string;
  htmlFile: string;
  manifestFile: string | null;
  checks: PwaInstallCheckItem[];
  missing: string[];
  installReady: boolean;
}

export interface PwaInstallAuditReport {
  scannedAt: string;
  entries: PwaInstallAuditEntry[];
  readyCount: number;
  totalPwa: number;
  allMissing: string[];
}

interface PwaInstallSpec {
  route: string;
  htmlFile: string;
  manifestFile: string | null;
  expectedStartUrl: string;
  expectedScope: string | null;
  serviceWorkerPath: string;
  dynamicManifest?: boolean;
}

const INSTALL_SPECS: PwaInstallSpec[] = [
  {
    route: "/app",
    htmlFile: "app-hub.html",
    manifestFile: "manifest.webmanifest",
    expectedStartUrl: "/app",
    expectedScope: "/",
    serviceWorkerPath: "/service-worker.js",
  },
  {
    route: "/survey",
    htmlFile: "survey.html",
    manifestFile: "manifest-survey.webmanifest",
    expectedStartUrl: "/survey",
    expectedScope: null,
    serviceWorkerPath: "/service-worker.js",
  },
  {
    route: "/business",
    htmlFile: "business.html",
    manifestFile: "manifest-business.webmanifest",
    expectedStartUrl: "/business",
    expectedScope: "/business",
    serviceWorkerPath: "/sw-business.js",
  },
  {
    route: "/customer/:code",
    htmlFile: "customer-portal.html",
    manifestFile: "manifest-customer.webmanifest",
    expectedStartUrl: "/customer/TOMS001",
    expectedScope: "/customer/TOMS001",
    serviceWorkerPath: "/service-worker.js",
    dynamicManifest: true,
  },
  {
    route: "/customer/:code/install/home",
    htmlFile: "installer-home.html",
    manifestFile: "manifest-installer.webmanifest",
    expectedStartUrl: "/customer/TOMS001/install/home",
    expectedScope: "/",
    serviceWorkerPath: "/service-worker.js",
    dynamicManifest: true,
  },
  {
    route: "/customer/:code/pro-remote",
    htmlFile: "pro-remote.html",
    manifestFile: "manifest-pro-remote.webmanifest",
    expectedStartUrl: "/customer/TOMS001/pro-remote",
    expectedScope: "/customer/TOMS001",
    serviceWorkerPath: "/service-worker.js",
    dynamicManifest: true,
  },
];

function readText(rel: string): string | null {
  const p = path.join(publicDir, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function readJson(rel: string): Record<string, unknown> | null {
  const raw = readText(rel);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function htmlHas(rel: string, pattern: RegExp): boolean {
  const html = readText(rel);
  if (!html) return false;
  return pattern.test(html);
}

const HTML_SCRIPT_MODULES: Record<string, string[]> = {
  "app-hub.html": ["js/app-hub.js"],
  "survey.html": ["js/tisly-pwa-shell.js"],
  "business.html": ["business.html"],
  "customer-portal.html": ["js/customer-portal.js"],
  "installer-home.html": ["js/installer-pwa.js"],
  "pro-remote.html": ["js/tisly-pwa-shell.js", "js/pro-remote-pwa.js"],
};

function swRegisteredInHtml(htmlFile: string, swPath: string): boolean {
  const html = readText(htmlFile);
  if (!html) return false;
  const esc = swPath.replace(/\//g, "\\/");
  const direct =
    new RegExp(`register\\(["']${esc}["']`).test(html) ||
    html.includes("tisly-pwa-shell.js") ||
    html.includes("installer-pwa.js") ||
    html.includes("installer-mode.js");
  if (direct) return true;

  const modules = HTML_SCRIPT_MODULES[htmlFile] ?? [];
  for (const mod of modules) {
    const content = readText(mod.startsWith("js/") ? mod : htmlFile);
    if (!content) continue;
    if (
      content.includes("serviceWorker.register") ||
      content.includes("tisly-pwa-shell") ||
      content.includes("installer-pwa")
    ) {
      return true;
    }
  }
  return false;
}

function auditOne(spec: PwaInstallSpec): PwaInstallAuditEntry {
  const checks: PwaInstallCheckItem[] = [];
  const missing: string[] = [];

  const htmlExists = fs.existsSync(path.join(publicDir, spec.htmlFile));
  checks.push({
    id: "html",
    label: "HTML",
    ok: htmlExists,
    detail: spec.htmlFile,
  });
  if (!htmlExists) missing.push(`html:${spec.htmlFile}`);

  const hasManifestLink = htmlHas(spec.htmlFile, /rel=["']manifest["']/i);
  checks.push({
    id: "manifest_link",
    label: "manifest",
    ok: hasManifestLink,
  });
  if (!hasManifestLink) missing.push("manifest link");

  const hasThemeColor = htmlHas(spec.htmlFile, /name=["']theme-color["']/i);
  checks.push({
    id: "theme_color",
    label: "theme-color",
    ok: hasThemeColor,
  });
  if (!hasThemeColor) missing.push("theme-color");

  const hasAppleTouch = htmlHas(spec.htmlFile, /rel=["']apple-touch-icon["']/i);
  checks.push({
    id: "apple_touch",
    label: "apple touch icon",
    ok: hasAppleTouch,
  });
  if (!hasAppleTouch) missing.push("apple-touch-icon");

  const swFile = spec.serviceWorkerPath.replace(/^\//, "");
  const swExists = fs.existsSync(path.join(publicDir, swFile));
  const swReg = swRegisteredInHtml(spec.htmlFile, spec.serviceWorkerPath);
  checks.push({
    id: "service_worker",
    label: "service worker",
    ok: swExists && swReg,
    detail: `${spec.serviceWorkerPath} file=${swExists} register=${swReg}`,
  });
  if (!swExists) missing.push(`service-worker file:${swFile}`);
  if (!swReg) missing.push("service worker registration");

  const icon192 = fs.existsSync(path.join(publicDir, "icons/icon-192.png"));
  const icon512 = fs.existsSync(path.join(publicDir, "icons/icon-512.png"));
  checks.push({
    id: "icons",
    label: "icons",
    ok: icon192 && icon512,
    detail: `192=${icon192} 512=${icon512}`,
  });
  if (!icon192) missing.push("icons/icon-192.png");
  if (!icon512) missing.push("icons/icon-512.png");

  let manifest: Record<string, unknown> | null = null;
  if (spec.manifestFile) {
    manifest = readJson(spec.manifestFile);
    checks.push({
      id: "manifest_file",
      label: "manifest file",
      ok: manifest !== null,
      detail: spec.manifestFile,
    });
    if (!manifest) missing.push(`manifest:${spec.manifestFile}`);
  }

  if (manifest) {
    const display = manifest.display === "standalone";
    checks.push({ id: "display", label: "display standalone", ok: display });
    if (!display) missing.push("display:standalone");

    const startUrl = String(manifest.start_url ?? "");
    const startOk =
      startUrl === spec.expectedStartUrl ||
      (spec.route === "/app" && (startUrl === "/" || startUrl === "/app"));
    checks.push({
      id: "start_url",
      label: "start_url",
      ok: startOk,
      detail: startUrl || "(empty)",
    });
    if (!startOk) missing.push(`start_url expected ${spec.expectedStartUrl}`);

    if (spec.expectedScope) {
      const scope = String(manifest.scope ?? "");
      const scopeOk = scope === spec.expectedScope || scope === "/";
      checks.push({
        id: "scope",
        label: "scope",
        ok: scopeOk,
        detail: scope || "(empty)",
      });
      if (!scopeOk) missing.push(`scope expected ${spec.expectedScope}`);
    }

    const icons = manifest.icons;
    const manifestIcons =
      Array.isArray(icons) &&
      icons.some((i: { src?: string }) => String(i?.src ?? "").includes("icon-192"));
    checks.push({
      id: "manifest_icons",
      label: "manifest icons",
      ok: manifestIcons,
    });
    if (!manifestIcons) missing.push("manifest icons");
  }

  const installReady = missing.length === 0;

  return {
    route: spec.route,
    htmlFile: spec.htmlFile,
    manifestFile: spec.manifestFile,
    checks,
    missing,
    installReady,
  };
}

export function buildPwaInstallAudit(): PwaInstallAuditReport {
  const entries = INSTALL_SPECS.map(auditOne);
  const readyCount = entries.filter((e) => e.installReady).length;
  const allMissing = [...new Set(entries.flatMap((e) => e.missing))];

  return {
    scannedAt: new Date().toISOString(),
    entries,
    readyCount,
    totalPwa: entries.length,
    allMissing,
  };
}

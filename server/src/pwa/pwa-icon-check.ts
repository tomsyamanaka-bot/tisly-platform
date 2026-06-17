/**
 * Phase 2041–2080 — PWA アイコン本番確認（manifest / apple-touch / キャッシュバスト）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { APP_ICON_VERSION, pwaIconSrc } from "./pwa-manifest-icons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

/** 旧アイコン（バージョンクエリなし）参照パターン */
const OLD_ICON_SRC_RE =
  /"src"\s*:\s*"\/icons\/icon-(?:64|128|192|256|384|512)\.png"(?!\?v=)/;

export interface PwaIconAssetCheck {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  detail?: string;
}

export interface PwaIconCheckReport {
  phase: "2041-2080";
  iconVersion: string;
  ready: boolean;
  checks: PwaIconAssetCheck[];
  manifestIconsVersioned: boolean;
  manifestNoOldIconUrls: boolean;
  appleTouchIconExists: boolean;
  appHubHasAppleTouchIcon: boolean;
  safariReinstallSteps: string[];
  curlVerifyBlock: string[];
}

const MANIFEST_FILES = [
  "manifest.webmanifest",
  "manifest.json",
  "manifest-survey.webmanifest",
  "manifest-business.webmanifest",
  "manifest-customer.webmanifest",
  "manifest-installer.webmanifest",
  "manifest-pro-remote.webmanifest",
  "manifest-maintenance.webmanifest",
];

const ICON_CHECK_URLS: {
  id: string;
  label: string;
  path: string;
  noVersion?: boolean;
}[] = [
  { id: "icon-192", label: "icon-192", path: "/icons/icon-192.png" },
  { id: "icon-512", label: "icon-512", path: "/icons/icon-512.png" },
  { id: "apple-touch-icon", label: "apple-touch-icon", path: "/apple-touch-icon.png", noVersion: true },
  { id: "manifest", label: "manifest.webmanifest", path: "/manifest.webmanifest" },
];

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(publicDir, rel));
}

function readText(rel: string): string | null {
  const p = path.join(publicDir, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function auditManifestFiles(): { versioned: boolean; noOldUrls: boolean; details: string[] } {
  const details: string[] = [];
  let versioned = true;
  let noOldUrls = true;

  for (const file of MANIFEST_FILES) {
    const raw = readText(file);
    if (!raw) {
      details.push(`${file}: missing`);
      versioned = false;
      noOldUrls = false;
      continue;
    }
    if (OLD_ICON_SRC_RE.test(raw)) {
      noOldUrls = false;
      details.push(`${file}: unversioned icon src`);
    }
    try {
      const json = JSON.parse(raw) as { icons?: { src?: string }[] };
      const icons = json.icons ?? [];
      for (const icon of icons) {
        const src = String(icon.src ?? "");
        if (!src.includes("/icons/icon-")) continue;
        if (!src.includes(`?v=${APP_ICON_VERSION}`)) {
          versioned = false;
          details.push(`${file}: ${src} lacks ?v=${APP_ICON_VERSION}`);
        }
      }
    } catch {
      details.push(`${file}: invalid JSON`);
      versioned = false;
      noOldUrls = false;
    }
  }

  return { versioned, noOldUrls, details };
}

export const SAFARI_PWA_REINSTALL_STEPS = [
  "既存の TiSLY ホーム画面アイコンを長押し →「削除」",
  "Safari で https://tisly.jp/app を開く",
  "共有ボタン →「ホーム画面に追加」",
  "追加画面のプレビューが青い TiSLY ロゴ（六角シールド）になっていることを確認",
  "まだ旧アイコン（緑盾）なら: 設定 → Safari →「履歴とWebサイトデータを消去」→ 上記を再実行",
] as const;

export function buildVpsPwaIconUpdateBlock(): string[] {
  return [
    "cd /opt/tisly",
    "git pull origin master",
    "cd server",
    "npm ci",
    "npm run build",
    "systemctl restart tisly-server",
    `curl -sI https://tisly.jp/icons/icon-192.png?v=${APP_ICON_VERSION} | head -3`,
    "curl -sI https://tisly.jp/apple-touch-icon.png | head -3",
    "curl -s https://tisly.jp/api/deploy/pwa-icon-check | head -c 400",
  ];
}

/** @deprecated buildVpsPwaIconUpdateBlock() を使用 */
export const VPS_PWA_ICON_UPDATE_BLOCK = buildVpsPwaIconUpdateBlock();

export function buildPwaIconCheck(): PwaIconCheckReport {
  const manifestAudit = auditManifestFiles();
  const appleTouchIconExists = fileExists("apple-touch-icon.png");
  const hubHtml = readText("app-hub.html") ?? "";
  const appHubHasAppleTouchIcon = /rel=["']apple-touch-icon["']/i.test(hubHtml);

  const checks: PwaIconAssetCheck[] = ICON_CHECK_URLS.map((spec) => {
    const url = spec.noVersion
      ? spec.path
      : spec.path.endsWith(".webmanifest")
        ? `${spec.path}?v=${APP_ICON_VERSION}`
        : pwaIconSrc(spec.path);
    const rel = spec.path.replace(/^\//, "");
    const ok = fileExists(rel);
    return {
      id: spec.id,
      label: spec.label,
      url,
      ok,
      detail: ok ? "file exists" : "file missing",
    };
  });

  const manifestIconsVersioned = manifestAudit.versioned;
  const manifestNoOldIconUrls = manifestAudit.noOldUrls;

  const ready =
    checks.every((c) => c.ok) &&
    manifestIconsVersioned &&
    manifestNoOldIconUrls &&
    appleTouchIconExists &&
    appHubHasAppleTouchIcon;

  return {
    phase: "2041-2080",
    iconVersion: APP_ICON_VERSION,
    ready,
    checks,
    manifestIconsVersioned,
    manifestNoOldIconUrls,
    appleTouchIconExists,
    appHubHasAppleTouchIcon,
    safariReinstallSteps: [...SAFARI_PWA_REINSTALL_STEPS],
    curlVerifyBlock: [
      `curl -sI https://tisly.jp/icons/icon-192.png?v=${APP_ICON_VERSION} | head -3`,
      `curl -sI https://tisly.jp/icons/icon-512.png?v=${APP_ICON_VERSION} | head -3`,
      `curl -sI https://tisly.jp/apple-touch-icon.png | head -3`,
      `curl -s https://tisly.jp/manifest.webmanifest?v=${APP_ICON_VERSION} | grep -o 'icon-192[^"]*' | head -3`,
      "curl -s https://tisly.jp/api/deploy/pwa-icon-check",
    ],
  };
}

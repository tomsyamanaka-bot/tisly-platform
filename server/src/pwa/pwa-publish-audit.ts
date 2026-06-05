/**
 * Phase 1241–1280 — PWA 本番公開監査（tisly.jp デプロイ前チェック）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MOCK_REAL_GUARDS,
  checkProductionEnv,
  type EnvCheckItem,
} from "../config/production-env-checker.js";
import { RC2_PRODUCTION_ROUTES } from "../config/production-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

export type PublishStatus = "ok" | "caution" | "not_ready";

export interface PwaPublishAuditItem {
  pwaName: string;
  id: string;
  productionUrl: string;
  localUrl: string;
  manifestUrl: string;
  scope: string;
  startUrl: string;
  serviceWorker: string;
  installReady: boolean;
  missingItems: string[];
  recommendedAction: string;
  status: PublishStatus;
  isPwa: boolean;
}

export interface MockRealStatus {
  service: string;
  mode: "mock" | "real" | "unknown";
  envKeys: string[];
  demoSafe: string;
}

export interface PwaPublishAuditReport {
  generatedAt: string;
  productionBaseUrl: string;
  localBaseUrl: string;
  tislyPublicUrl: string;
  isProductionUrl: boolean;
  nodeEnv: string;
  mockReal: MockRealStatus[];
  envChecks: EnvCheckItem[];
  hasBlockingEnvErrors: boolean;
  pwAs: PwaPublishAuditItem[];
  summary: {
    ok: number;
    caution: number;
    notReady: number;
    installReady: number;
  };
}

interface PwaAuditSpec {
  id: string;
  pwaName: string;
  pathTemplate: string;
  manifestPath: string;
  scope: string;
  startUrl: string;
  serviceWorker: string;
  isPwa: boolean;
  manifestIsDynamic?: boolean;
  staticManifestFile?: string;
}

const DEMO_CUSTOMER = "TOMS001";

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

function productionBase(): string {
  const url = env("TISLY_PUBLIC_URL") || env("PUBLIC_BASE_URL") || "https://tisly.jp";
  return url.replace(/\/$/, "");
}

function localBase(): string {
  const port = env("TISLY_PORT") || env("PORT") || "3080";
  return `http://localhost:${port}`;
}

function resolvePath(template: string, customerCode = DEMO_CUSTOMER): string {
  return template.replace(":code", customerCode);
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(publicDir, relativePath));
}

function resolveMockRealMode(keys: string[]): "mock" | "real" | "unknown" {
  for (const key of keys) {
    const val = env(key).toLowerCase();
    if (val === "real" || val === "true") return "real";
    if (val === "mock" || val === "false") return "mock";
  }
  return "unknown";
}

/** RC2 公開対象 PWA の監査定義 */
export const PWA_AUDIT_SPECS: PwaAuditSpec[] = [
  {
    id: "app_hub",
    pwaName: "App Hub",
    pathTemplate: "/app",
    manifestPath: "/manifest.webmanifest",
    scope: "/",
    startUrl: "/app",
    serviceWorker: "/service-worker.js",
    isPwa: true,
    staticManifestFile: "manifest.webmanifest",
  },
  {
    id: "survey",
    pwaName: "現調 PWA",
    pathTemplate: "/survey",
    manifestPath: "/manifest-survey.webmanifest",
    scope: "/",
    startUrl: "/survey",
    serviceWorker: "/service-worker.js",
    isPwa: true,
    staticManifestFile: "manifest-survey.webmanifest",
  },
  {
    id: "business",
    pwaName: "TOMS Business",
    pathTemplate: "/business",
    manifestPath: "/business/manifest.webmanifest",
    scope: "/business",
    startUrl: "/business",
    serviceWorker: "/sw-business.js",
    isPwa: true,
    staticManifestFile: "manifest-business.webmanifest",
  },
  {
    id: "sales",
    pwaName: "営業デモ",
    pathTemplate: "/sales",
    manifestPath: "/manifest.webmanifest",
    scope: "/",
    startUrl: "/sales",
    serviceWorker: "/service-worker.js",
    isPwa: true,
    staticManifestFile: "manifest.webmanifest",
  },
  {
    id: "customer_portal",
    pwaName: "顧客ポータル",
    pathTemplate: "/customer/:code",
    manifestPath: "/customer/:code/manifest.webmanifest",
    scope: "/customer/:code",
    startUrl: "/customer/:code",
    serviceWorker: "/service-worker.js",
    isPwa: true,
    manifestIsDynamic: true,
  },
  {
    id: "pro_remote",
    pwaName: "PRO Remote",
    pathTemplate: "/customer/:code/pro-remote",
    manifestPath: "/customer/:code/pro-remote/manifest.webmanifest",
    scope: "/customer/:code",
    startUrl: "/customer/:code/pro-remote",
    serviceWorker: "/service-worker.js",
    isPwa: true,
    manifestIsDynamic: true,
  },
  {
    id: "installer",
    pwaName: "施工 PWA",
    pathTemplate: "/customer/:code/install/home",
    manifestPath: "/customer/:code/install/manifest.webmanifest",
    scope: "/",
    startUrl: "/customer/:code/install/home",
    serviceWorker: "/service-worker.js",
    isPwa: true,
    manifestIsDynamic: true,
  },
  {
    id: "google_tv",
    pwaName: "Google TV Web",
    pathTemplate: "/tv/:code",
    manifestPath: "",
    scope: "n/a",
    startUrl: "/tv/:code",
    serviceWorker: "n/a",
    isPwa: false,
  },
  {
    id: "deployment_checklist",
    pwaName: "導入チェックリスト",
    pathTemplate: "/deployment/checklist",
    manifestPath: "",
    scope: "n/a",
    startUrl: "/deployment/checklist",
    serviceWorker: "n/a",
    isPwa: false,
  },
];

function auditPwaItem(
  spec: PwaAuditSpec,
  prodBase: string,
  locBase: string,
  isProdUrl: boolean
): PwaPublishAuditItem {
  const routePath = resolvePath(spec.pathTemplate);
  const manifestUrl = spec.manifestPath ? resolvePath(spec.manifestPath) : "";
  const missingItems: string[] = [];

  const htmlRoute = RC2_PRODUCTION_ROUTES.find((r) => {
    const resolved = r.path.replace(":code", DEMO_CUSTOMER);
    return resolved === routePath || r.path === spec.pathTemplate;
  });
  if (htmlRoute?.htmlFile && !fileExists(htmlRoute.htmlFile)) {
    missingItems.push(`html:${htmlRoute.htmlFile}`);
  }

  if (spec.isPwa) {
    if (spec.staticManifestFile && !fileExists(spec.staticManifestFile)) {
      missingItems.push(`manifest:${spec.staticManifestFile}`);
    }
    if (spec.manifestIsDynamic && !spec.staticManifestFile) {
      // dynamic manifest routes are served by Express — no static file required
    }
    const swFile = spec.serviceWorker.replace(/^\//, "");
    if (!fileExists(swFile)) {
      missingItems.push(`serviceWorker:${swFile}`);
    }
    if (!fileExists("icons/icon-192.png")) missingItems.push("icons/icon-192.png");
    if (!fileExists("icons/icon-512.png")) missingItems.push("icons/icon-512.png");
    if (!isProdUrl) missingItems.push("TISLY_PUBLIC_URL が本番 URL ではない");
    if (!prodBase.startsWith("https://")) missingItems.push("HTTPS 公開 URL が未設定");
  }

  let status: PublishStatus = "ok";
  let recommendedAction = "本番公開準備 OK — nginx 反映後に実機でホーム画面追加を確認";

  if (!spec.isPwa) {
    status = "caution";
    recommendedAction =
      spec.id === "google_tv"
        ? "PWA ではなく TV 専用 Web — Chrome Cast / TV ブラウザで表示確認"
        : "Web ページ — ホーム画面追加は不要";
  } else if (missingItems.length > 0) {
    const blocking = missingItems.some(
      (m) =>
        m.startsWith("icons/") ||
        m.startsWith("serviceWorker:") ||
        m.includes("TISLY_PUBLIC_URL") ||
        m.includes("HTTPS")
    );
    status = blocking ? "not_ready" : "caution";
    recommendedAction =
      missingItems.includes("icons/icon-192.png") ||
      missingItems.includes("icons/icon-512.png")
        ? "node server/scripts/gen-pwa-icons.mjs でアイコン生成後、再監査"
        : missingItems.some((m) => m.includes("TISLY_PUBLIC_URL"))
          ? ".env.production で TISLY_PUBLIC_URL=https://tisly.jp を設定"
          : "不足ファイルを配置して npm run build 後に再確認";
  }

  const installReady =
    spec.isPwa &&
    missingItems.length === 0 &&
    isProdUrl &&
    prodBase.startsWith("https://");

  return {
    pwaName: spec.pwaName,
    id: spec.id,
    productionUrl: `${prodBase}${routePath}`,
    localUrl: `${locBase}${routePath}`,
    manifestUrl: manifestUrl ? `${prodBase}${manifestUrl}` : "",
    scope: spec.scope.replace(":code", DEMO_CUSTOMER),
    startUrl: spec.startUrl.replace(":code", DEMO_CUSTOMER),
    serviceWorker: spec.serviceWorker,
    installReady,
    missingItems,
    recommendedAction,
    status,
    isPwa: spec.isPwa,
  };
}

export function buildPwaPublishAudit(
  source: NodeJS.ProcessEnv = process.env
): PwaPublishAuditReport {
  const prodBase = (
    (source.TISLY_PUBLIC_URL ?? source.PUBLIC_BASE_URL ?? "https://tisly.jp") as string
  ).replace(/\/$/, "");
  const port = (source.TISLY_PORT ?? source.PORT ?? "3080") as string;
  const locBase = `http://localhost:${port}`;
  const publicUrl = (source.TISLY_PUBLIC_URL ?? source.PUBLIC_BASE_URL ?? "") as string;
  const isProdUrl =
    publicUrl.length > 0 &&
    !publicUrl.includes("localhost") &&
    !publicUrl.includes("127.0.0.1") &&
    publicUrl.startsWith("https://tisly.jp");

  const mockReal: MockRealStatus[] = MOCK_REAL_GUARDS.map((g) => ({
    service: g.service,
    mode: resolveMockRealMode(g.envKeys),
    envKeys: g.envKeys,
    demoSafe: g.demoSafe,
  }));

  const envChecks = checkProductionEnv(source);
  const hasBlocking = envChecks.some((i) => i.level === "error");

  const pwAs = PWA_AUDIT_SPECS.map((spec) =>
    auditPwaItem(spec, prodBase, locBase, isProdUrl)
  );

  const summary = {
    ok: pwAs.filter((p) => p.status === "ok").length,
    caution: pwAs.filter((p) => p.status === "caution").length,
    notReady: pwAs.filter((p) => p.status === "not_ready").length,
    installReady: pwAs.filter((p) => p.installReady).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    productionBaseUrl: prodBase,
    localBaseUrl: locBase,
    tislyPublicUrl: publicUrl || prodBase,
    isProductionUrl: isProdUrl,
    nodeEnv: (source.NODE_ENV ?? "development") as string,
    mockReal,
    envChecks,
    hasBlockingEnvErrors: hasBlocking,
    pwAs,
    summary,
  };
}

/** nginx テンプレートに含めるべきルート接頭辞 */
export const NGINX_REQUIRED_ROUTE_PREFIXES = [
  "/app",
  "/survey",
  "/business",
  "/sales",
  "/customer/",
  "/tv/",
  "/deployment/",
  "/api/",
  "/service-worker.js",
  "/manifest",
  "/icons/",
  "/sw-business.js",
];

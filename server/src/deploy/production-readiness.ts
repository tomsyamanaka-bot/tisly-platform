/**
 * Phase 1381–1400 — Production Readiness（/app ダッシュボード用）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { DeployDryRunReport } from "./deploy-dry-run.js";
import { buildProductionUrlAudit } from "./production-url-audit.js";
import { buildPwaInstallAudit } from "../pwa/pwa-install-audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const RELEASE_GATE_MARKER = path.join(serverRoot, "data", "release-gate-last.json");

export type ReadinessStatus = "pass" | "fail" | "warn";

export interface ProductionReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  message: string;
}

export interface ProductionReadinessReport {
  generatedAt: string;
  items: ProductionReadinessItem[];
  publishable: boolean;
  publishableLabel: string;
}

interface ReleaseGateMarker {
  generatedAt?: string;
  build?: boolean;
  test?: boolean;
  tsc?: boolean;
}

function readReleaseGateMarker(): ReleaseGateMarker | null {
  try {
    if (!fs.existsSync(RELEASE_GATE_MARKER)) return null;
    return JSON.parse(fs.readFileSync(RELEASE_GATE_MARKER, "utf8")) as ReleaseGateMarker;
  } catch {
    return null;
  }
}

function nginxHasWebSocket(): boolean {
  const confPath = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
  if (!fs.existsSync(confPath)) return false;
  const conf = fs.readFileSync(confPath, "utf8");
  return conf.includes("location /ws") && conf.includes("Upgrade");
}

export function buildProductionReadiness(
  dryRun: DeployDryRunReport
): ProductionReadinessReport {
  const urlAudit = buildProductionUrlAudit();
  const installAudit = buildPwaInstallAudit();
  const marker = readReleaseGateMarker();
  const distExists = fs.existsSync(path.join(serverRoot, "dist/index.js"));

  const pwaTotal = dryRun.pwaAudit.pwAs.filter((p) => p.isPwa).length;
  const pwaReady =
    installAudit.readyCount === installAudit.totalPwa &&
    dryRun.pwaInstallReady === pwaTotal;

  const secretLeakOk = dryRun.secretLeakCheck?.passed === true;

  const items: ProductionReadinessItem[] = [
    {
      id: "build",
      label: "Build OK",
      status: marker?.build || distExists ? "pass" : "warn",
      message:
        marker?.build || distExists
          ? "dist/index.js ビルド済み"
          : "npm run build 未実行",
    },
    {
      id: "test",
      label: "Test OK",
      status: marker?.test ? "pass" : distExists ? "warn" : "fail",
      message: marker?.test
        ? `npm run test 合格 (${marker.generatedAt ?? "—"})`
        : "npm run release:gate で test 実行推奨",
    },
    {
      id: "pwa_ready",
      label: "PWA Ready",
      status: pwaReady ? "pass" : installAudit.readyCount > 0 ? "warn" : "fail",
      message: `${installAudit.readyCount}/${installAudit.totalPwa} installReady · audit ${dryRun.pwaInstallReady}/${pwaTotal}`,
    },
    {
      id: "production_url",
      label: "Production URL OK",
      status:
        dryRun.isProductionUrl && urlAudit.publicFacingClean ? "pass" : "fail",
      message: dryRun.isProductionUrl
        ? urlAudit.publicFacingClean
          ? `TISLY_PUBLIC_URL=${dryRun.tislyPublicUrl} · 公開コードに違反なし`
          : `公開コードに localhost 等 ${urlAudit.blockingCount} 件`
        : `本番 URL 未設定: ${dryRun.tislyPublicUrl || "—"}`,
    },
    {
      id: "https_ready",
      label: "HTTPS Ready",
      status: dryRun.tislyPublicUrl.startsWith("https://tisly.jp") ? "pass" : "fail",
      message: dryRun.tislyPublicUrl.startsWith("https://")
        ? dryRun.tislyPublicUrl
        : "https://tisly.jp を設定",
    },
    {
      id: "ws_ready",
      label: "WS Ready",
      status: nginxHasWebSocket() && urlAudit.publicFacingClean ? "pass" : "fail",
      message: nginxHasWebSocket()
        ? "nginx /ws + クライアントは wss://tisly.jp/ws（location.host 相対）"
        : "nginx WebSocket 設定不足",
    },
    {
      id: "secret_leak",
      label: "Secret Leak OK",
      status: secretLeakOk ? "pass" : "fail",
      message: secretLeakOk
        ? "git diff に実値 secret なし"
        : dryRun.secretLeakCheck?.findings?.join(" · ") || "secret leak 要確認",
    },
    {
      id: "deploy_ready",
      label: "Deploy Ready",
      status: dryRun.passed && urlAudit.publicFacingClean ? "pass" : "fail",
      message: dryRun.passed
        ? "dry-run 全チェック合格"
        : `阻害: ${dryRun.checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ") || "要確認"}`,
    },
  ];

  const publishable = items.every((i) => i.status === "pass");

  return {
    generatedAt: new Date().toISOString(),
    items,
    publishable,
    publishableLabel: publishable ? "公開準備完了" : "公開準備中",
  };
}

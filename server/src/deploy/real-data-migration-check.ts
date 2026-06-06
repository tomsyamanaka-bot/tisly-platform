/**
 * Phase 2201–2250 — 実データ移行チェック
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { resolveProFloorImageUrl } from "../pro-remote/floor-map-stack.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");
const serverSrcDir = path.join(__dirname, "..");

export interface RealDataMigrationCheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface RealDataMigrationReport {
  phase: "2201-2250";
  ready: boolean;
  shellVersion: string;
  shellTag: string;
  productionRatePercent: number;
  implemented: string[];
  mockRemaining: string[];
  nextPhase: string;
  checks: RealDataMigrationCheckItem[];
}

function readText(rel: string): string | null {
  const p = path.join(publicDir, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(publicDir, rel));
}

export function buildRealDataMigrationCheck(): RealDataMigrationReport {
  const proRemoteHtml = readText("pro-remote.html") ?? "";
  const proRemoteJs = readText("js/pro-remote-pwa.js") ?? "";
  const proRemoteMqtt = readText("js/pro-remote-mqtt-panel.js") ?? "";
  const floorMapJs = readText("js/pro-remote-floor-map.js") ?? "";
  const maintenanceJs = readText("js/maintenance.js") ?? "";
  const installHubJs = readText("js/install-hub.js") ?? "";
  const portalJs = readText("js/customer-portal.js") ?? "";
  const shellJs = readText("js/tisly-pwa-shell.js") ?? "";
  const appTs = fs.existsSync(path.join(serverSrcDir, "app.ts"))
    ? fs.readFileSync(path.join(serverSrcDir, "app.ts"), "utf8")
    : "";
  const installPhotosTs = fs.existsSync(
    path.join(serverSrcDir, "installer", "install-photos.ts")
  )
    ? fs.readFileSync(path.join(serverSrcDir, "installer", "install-photos.ts"), "utf8")
    : "";
  const maintNotesTs = fs.existsSync(
    path.join(serverSrcDir, "maintenance", "maintenance-inspection-notes.ts")
  )
    ? fs.readFileSync(path.join(serverSrcDir, "maintenance", "maintenance-inspection-notes.ts"), "utf8")
    : "";

  const svgUrl = resolveProFloorImageUrl("/assets/demo-floor/1f.svg");
  const checks: RealDataMigrationCheckItem[] = [
    {
      id: "pro-remote-mqtt-panel",
      label: "PRO Remote MQTT ステータス UI",
      ok: proRemoteHtml.includes("pro-mqtt-connection") && proRemoteMqtt.includes("mqtt-status"),
    },
    {
      id: "mqtt-broker-default",
      label: "MQTT 既定ブローカー mqtt.tisly.jp",
      ok: fs.existsSync(path.join(serverSrcDir, "config.ts"))
        ? fs.readFileSync(path.join(serverSrcDir, "config.ts"), "utf8").includes("mqtt.tisly.jp")
        : false,
    },
    {
      id: "maintenance-inspection-api",
      label: "保守点検メモ API (GET/POST)",
      ok:
        maintenanceJs.includes("/api/maintenance/inspection") &&
        !maintenanceJs.includes("tisly_maint_memo") &&
        maintNotesTs.includes("saveMaintenanceInspectionNote"),
    },
    {
      id: "install-photo-customer-files",
      label: "施工写真 /customer-files/ 保存",
      ok:
        installPhotosTs.includes("customer-files") &&
        appTs.includes('"/customer-files"') &&
        installHubJs.includes("isAllowedPhoto"),
    },
    {
      id: "portal-events-api",
      label: "顧客ポータル通知履歴 API",
      ok:
        portalJs.includes("fetchPortalEvents") &&
        portalJs.includes('data-source="api"') &&
        !portalJs.includes("mockEvents"),
    },
    {
      id: "floor-map-svg-url",
      label: "フロアマップ SVG URL 解決",
      ok: svgUrl === "/assets/demo-floor/1f.svg",
    },
    {
      id: "floor-map-svg-log",
      label: "SVG 読込失敗ログ",
      ok: floorMapJs.includes("[floor-map] SVG load failed"),
    },
    {
      id: "floor-map-pin-abbr",
      label: "ピン ? 表示修正",
      ok: floorMapJs.includes("PIN_ABBR") && !floorMapJs.includes('(pin.pinType || "?")'),
    },
    {
      id: "mock-real-banner",
      label: "全PWA Mock/Real バナー",
      ok:
        shellJs.includes("tisly-mock-real-banner") &&
        shellJs.includes("loadMockRealBanner") &&
        fileExists("css/tisly-pwa-shell.css"),
    },
    {
      id: "shell-version-2250",
      label: "PWA shell v2250+",
      ok: Number(PWA_SHELL_VERSION) >= 2250,
    },
  ];

  const implemented = [
    "PRO Remote MQTT 接続状態・受信件数・最終受信表示",
    "保守PWA 点検メモ API 保存 (GET/POST /api/maintenance/inspection)",
    "施工PWA 写真アップロード jpg/png → /customer-files/",
    "顧客ポータル 通知履歴 API 取得（モックフォールバック削除）",
    "フロアマップ SVG URL 修正・読込失敗ログ・ピン略称",
    "全PWA Mock/Real 表示バナー",
  ];

  const mockRemaining = [
    "MQTT_MODE=mock 既定（本番は MQTT_MODE=real + MQTT_SUBSCRIBER_ENABLED=true）",
    "Gmail / QNAP / Shelly mock 既定",
    "Demo Kit シードデータ（events / floor maps）",
    "保守案件オフラインキュー（localStorage）",
  ];

  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);

  return {
    phase: "2201-2250",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    implemented,
    mockRemaining,
    nextPhase: "2251-2300 — Gmail/QNAP/Shelly 実接続切替と Demo Kit シード分離",
    checks,
  };
}

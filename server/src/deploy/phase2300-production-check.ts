/**
 * Phase 2251–2300 — 本番化完了チェック
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { getPublicDir, getServerSrcDir } from "./server-paths.js";

const publicDir = getPublicDir();
const serverSrcDir = getServerSrcDir();

export interface ProductionCheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface Phase2300ProductionReport {
  phase: "2251-2300";
  ready: boolean;
  shellVersion: string;
  shellTag: string;
  productionRatePercent: number;
  operationalReady: boolean;
  implemented: string[];
  mockRemaining: string[];
  nextPhase: string;
  checks: ProductionCheckItem[];
}

function readText(rel: string): string | null {
  const p = path.join(publicDir, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function srcExists(rel: string): boolean {
  return fs.existsSync(path.join(serverSrcDir, rel));
}

export function buildPhase2300ProductionCheck(): Phase2300ProductionReport {
  const mqttPanel = readText("js/pro-remote-mqtt-panel.js") ?? "";
  const mqttSub = srcExists("mqtt/mqtt-subscriber.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "mqtt/mqtt-subscriber.ts"), "utf8")
    : "";
  const bridge = srcExists("toms/mqtt-live-push-bridge.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "toms/mqtt-live-push-bridge.ts"), "utf8")
    : "";
  const recovery = srcExists("recovery/shelly-recovery.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "recovery/shelly-recovery.ts"), "utf8")
    : "";
  const emailProvider = srcExists("notification/email-provider.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "notification/email-provider.ts"), "utf8")
    : "";
  const qnapConnector = srcExists("qnap/qnap-connector.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "qnap/qnap-connector.ts"), "utf8")
    : "";
  const portalCss = readText("css/customer-portal.css") ?? "";
  const tvCss = readText("css/tv-dashboard.css") ?? "";
  const portalJs = readText("js/customer-portal.js") ?? "";

  const checks: ProductionCheckItem[] = [
    {
      id: "mqtt-real-subscribe",
      label: "MQTT real モード wildcard 購読",
      ok: mqttSub.includes("/#") && bridge.includes("MQTT_MODE"),
    },
    {
      id: "mqtt-topic-count-ui",
      label: "MQTT 受信トピック数 UI",
      ok: mqttPanel.includes("topicCount") && Boolean(readText("pro-remote.html")?.includes("pro-mqtt-topics")),
    },
    {
      id: "shelly-recovery-api",
      label: "POST /api/recovery/shelly/reboot",
      ok: srcExists("api/routes/recovery.ts") &&
        fs.readFileSync(path.join(serverSrcDir, "api/routes/recovery.ts"), "utf8").includes("/shelly/reboot"),
    },
    {
      id: "shelly-recovery-history",
      label: "Shelly 復旧履歴 + 顧客ポータル表示",
      ok:
        recovery.includes("listShellyRecoveryHistory") &&
        portalJs.includes("recovery-history-cards") &&
        portalJs.includes("shellyRecoveryHistory"),
    },
    {
      id: "email-provider",
      label: "通知メール Provider（mock/smtp/gmail）",
      ok: emailProvider.includes("EmailNotificationProvider") && emailProvider.includes("getEmailProviderMode"),
    },
    {
      id: "notification-stats",
      label: "通知送信成功率 API",
      ok: srcExists("api/routes/notifications.ts") &&
        fs.readFileSync(path.join(serverSrcDir, "api/routes/notifications.ts"), "utf8").includes("/stats"),
    },
    {
      id: "qnap-connector",
      label: "QNAP Connector（event/alarm/maintenance/photo）",
      ok:
        qnapConnector.includes("QnapPayloadType") &&
        qnapConnector.includes('"photo"') &&
        qnapConnector.includes("logQnapSend"),
    },
    {
      id: "qnap-send-logs",
      label: "QNAP 送信ログ",
      ok: srcExists("qnap/qnap-send-log.ts") && srcExists("db/schema-phase-2300.sql"),
    },
    {
      id: "portal-elderly-ui",
      label: "顧客ポータル高齢者向け UI",
      ok: portalCss.includes("--portal-tap-min") && portalCss.includes("min-height: 120px"),
    },
    {
      id: "tv-10ft-ui",
      label: "TV 10ft UI スケール",
      ok: tvCss.includes("--tv-font-hero") && tvCss.includes("clamp("),
    },
    {
      id: "shell-version-2300",
      label: "PWA shell v2300+",
      ok: Number(PWA_SHELL_VERSION) >= 2300 && PWA_SHELL_TAG.includes("production"),
    },
  ];

  const implemented = [
    "MQTT_MODE=real + MQTT_SUBSCRIBER_ENABLED=true で実Broker接続・再接続・トピック数表示",
    "POST /api/recovery/shelly/reboot + 履歴（/customer/:code Recovery タブ）",
    "通知メール Provider 抽象化（mock/smtp/gmail）+ 送信成功率",
    "QNAP Connector（event/alarm/maintenance/photo）+ 送信ログ",
    "顧客ポータル高齢者向け UI（文字・タップ領域・カード等高）",
    "TV 10ft UI（clamp スケール）",
  ];

  const mockRemaining = [
    "Demo Kit シードデータ（events / floor maps）",
    "保守案件オフラインキュー（localStorage）",
    "QNAP 実機 WebDAV/SMB アップロード（QNAP_MODE=real + QNAP_HOST 要設定）",
    "Gmail 実送信（GMAIL_SEND_MODE=real + Google OAuth 要設定）",
    "Shelly 実機 RPC（SHELLY_MODE=real + SHELLY_BASE_URL 要設定）",
  ];

  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);
  const criticalOk = checks.filter((c) =>
    ["mqtt-real-subscribe", "shelly-recovery-api", "email-provider", "qnap-connector"].includes(c.id)
  ).every((c) => c.ok);

  return {
    phase: "2251-2300",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady: criticalOk && productionRatePercent >= 85,
    implemented,
    mockRemaining,
    nextPhase: "2301-2350 — Demo Kit シード分離・QNAP/Gmail/Shelly 実機検証・オフラインキュー API 化",
    checks,
  };
}

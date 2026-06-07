/**
 * Phase 2301–2350 — Gmail SMTP 実運用チェック
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { getPublicDir, getServerRoot, getServerSrcDir } from "./server-paths.js";

const publicDir = getPublicDir();
const serverRoot = getServerRoot();
const serverSrcDir = getServerSrcDir();

export interface ProductionCheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface Phase2350ProductionReport {
  phase: "2301-2350";
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

export function buildPhase2350ProductionCheck(): Phase2350ProductionReport {
  const smtpGmail = srcExists("notification/smtp-gmail.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "notification/smtp-gmail.ts"), "utf8")
    : "";
  const gmailLog = srcExists("notification/gmail-send-log.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "notification/gmail-send-log.ts"), "utf8")
    : "";
  const emailProvider = srcExists("notification/email-provider.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "notification/email-provider.ts"), "utf8")
    : "";
  const notificationsRoute = srcExists("api/routes/notifications.ts")
    ? fs.readFileSync(path.join(serverSrcDir, "api/routes/notifications.ts"), "utf8")
    : "";
  const appHubHtml = readText("app-hub.html") ?? "";
  const appHubJs = readText("js/app-hub.js") ?? "";
  const envExample = fs.existsSync(path.join(serverRoot, ".env.production.example"))
    ? fs.readFileSync(path.join(serverRoot, ".env.production.example"), "utf8")
    : "";

  const checks: ProductionCheckItem[] = [
    {
      id: "smtp-gmail-provider",
      label: "Gmail SMTP Provider（mock/real 切替）",
      ok: smtpGmail.includes("sendSmtpGmailMail") && smtpGmail.includes("maskSmtpCredentials"),
    },
    {
      id: "gmail-send-logs",
      label: "Gmail 送信ログ DB",
      ok:
        gmailLog.includes("logGmailSend") &&
        srcExists("db/schema-phase-2350.sql"),
    },
    {
      id: "email-provider-gmail-smtp",
      label: "通知 Provider gmail → SMTP",
      ok: emailProvider.includes("GmailSmtpEmailProvider"),
    },
    {
      id: "notification-test-email",
      label: "POST /api/notifications/test-email",
      ok: notificationsRoute.includes("/test-email") && notificationsRoute.includes("NOTIFICATION_TEST_TO"),
    },
    {
      id: "notification-stats-gmail",
      label: "GET /api/notifications/stats gmailMode",
      ok:
        notificationsRoute.includes("gmailMode") &&
        notificationsRoute.includes("smtpConfigured") &&
        notificationsRoute.includes("lastSendStatus"),
    },
    {
      id: "gmail-yellow-startup",
      label: "SMTP_PASS 未設定時 YELLOW（起動継続）",
      ok: smtpGmail.includes("Gmail not configured") && smtpGmail.includes("logGmailStartupStatus"),
    },
    {
      id: "app-hub-gmail-card",
      label: "App Hub Gmail通知テストカード",
      ok: appHubHtml.includes("gmail-test-card") && appHubJs.includes("btn-gmail-test-send"),
    },
    {
      id: "env-production-smtp",
      label: ".env.production.example SMTP 項目",
      ok:
        envExample.includes("SMTP_HOST") &&
        envExample.includes("SMTP_PASS") &&
        envExample.includes("NOTIFICATION_EMAIL_MODE"),
    },
    {
      id: "shell-version-2350",
      label: "PWA shell v2350",
      ok: Number(PWA_SHELL_VERSION) >= 2350 && PWA_SHELL_TAG.includes("production"),
    },
  ];

  const implemented = [
    "Gmail SMTP Provider（GMAIL_SEND_MODE=mock|real + NOTIFICATION_EMAIL_MODE=gmail）",
    "SMTP_PASS 未設定時は起動継続・YELLOW「Gmail not configured」",
    "POST /api/notifications/test-email（NOTIFICATION_TEST_TO）",
    "GET /api/notifications/stats — gmailMode / smtpConfigured / lastSendStatus",
    "gmail_send_logs テーブル（送信成功・失敗を DB 保存）",
    "App Hub「Gmail通知テスト」カード",
  ];

  const mockRemaining = [
    "Business Gmail OAuth 実送信（営業 PDF 添付メール）",
    "QNAP 実機 WebDAV/SMB アップロード（QNAP_MODE=real）",
    "Shelly 実機 RPC（SHELLY_MODE=real）",
    "Demo Kit シードデータ分離",
  ];

  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);
  const criticalOk = checks
    .filter((c) =>
      ["smtp-gmail-provider", "notification-test-email", "notification-stats-gmail", "gmail-send-logs"].includes(
        c.id
      )
    )
    .every((c) => c.ok);

  return {
    phase: "2301-2350",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady: criticalOk && productionRatePercent >= 85,
    implemented,
    mockRemaining,
    nextPhase: "2351-2400 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}

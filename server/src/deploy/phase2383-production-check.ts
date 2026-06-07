/**
 * Phase 2383 — Gmail 通知経路（SMTP 実運用 + test-email 準備）
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { getGmailSmtpStatus } from "../notification/smtp-gmail.js";
import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import { buildPhase2381ProductionCheck } from "./phase2381-production-check.js";
import { getRepoRoot, getServerRoot, getServerSrcDir } from "./server-paths.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";

export interface Phase2383ProductionReport {
  phase: "2383";
  ready: boolean;
  shellVersion: string;
  shellTag: string;
  productionRatePercent: number;
  operationalReady: boolean;
  adminPasswordStatus: ProductionCheckStatus;
  gmailInfraStatus: "GREEN" | "YELLOW" | "RED";
  gmailMode: string;
  smtpConfigured: boolean;
  notificationTestToConfigured: boolean;
  maskedCredentials: string;
  lastSendStatus: ReturnType<typeof getLastGmailSendStatus>;
  implemented: string[];
  mockRemaining: string[];
  nextPhase: string;
  checks: ProductionCheckItem[];
}

function readText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function buildPhase2383ProductionCheck(
  env: NodeJS.ProcessEnv = process.env
): Phase2383ProductionReport {
  const base = buildPhase2381ProductionCheck(env);
  const serverRoot = getServerRoot();
  const serverSrcDir = getServerSrcDir();
  const repoRoot = getRepoRoot();

  const smtpGmail = readText(path.join(serverSrcDir, "notification/smtp-gmail.ts")) ?? "";
  const notificationsRoute = readText(path.join(serverSrcDir, "api/routes/notifications.ts")) ?? "";
  const recoveryDoc = readText(path.join(repoRoot, "docs/admin-password-recovery.md")) ?? "";

  const gmail = getGmailSmtpStatus(env);
  const testTo = (env.NOTIFICATION_TEST_TO ?? "").trim();
  const notificationEmailMode = (env.NOTIFICATION_EMAIL_MODE ?? "mock").toLowerCase();

  const gmailRuntimeOk =
    gmail.gmailMode === "mock" ||
    (gmail.gmailMode === "real" && gmail.smtpConfigured && Boolean(testTo));

  const gmailChecks: ProductionCheckItem[] = [
    {
      id: "gmail-smtp-provider-src",
      label: "Gmail SMTP Provider（smtp-gmail.ts）",
      ok: smtpGmail.includes("sendSmtpGmailMail") && smtpGmail.includes("getGmailSmtpStatus"),
      status: smtpGmail.includes("sendSmtpGmailMail") ? "GREEN" : "RED",
    },
    {
      id: "notification-test-email-route",
      label: "POST /api/notifications/test-email",
      ok: notificationsRoute.includes("/test-email") && notificationsRoute.includes("requireAdminAuth"),
      status:
        notificationsRoute.includes("/test-email") && notificationsRoute.includes("requireAdminAuth")
          ? "GREEN"
          : "RED",
    },
    {
      id: "notification-test-to-env",
      label: "NOTIFICATION_TEST_TO 設定",
      ok: Boolean(testTo),
      status: testTo ? "GREEN" : gmail.gmailMode === "real" ? "RED" : "YELLOW",
      detail: testTo ? "設定済み（宛先はマスク）" : "未設定 — test-email は 400",
    },
    {
      id: "gmail-smtp-runtime",
      label: "Gmail SMTP ランタイム（real 時 SMTP_USER + SMTP_PASS）",
      ok: gmail.smtpConfigured || gmail.gmailMode === "mock",
      status: gmail.infraStatus,
      detail: gmail.maskedCredentials,
    },
    {
      id: "notification-email-mode",
      label: "NOTIFICATION_EMAIL_MODE=gmail",
      ok: notificationEmailMode === "gmail" || gmail.gmailMode === "mock",
      status: notificationEmailMode === "gmail" ? "GREEN" : "YELLOW",
      detail: `NOTIFICATION_EMAIL_MODE=${notificationEmailMode}`,
    },
    {
      id: "docs-gmail-test-email",
      label: "docs/admin-password-recovery.md — test-email 手順",
      ok: recoveryDoc.includes("test-email") && recoveryDoc.includes("SMTP_USER"),
      status: recoveryDoc.includes("test-email") ? "GREEN" : "RED",
    },
    {
      id: "gmail-send-ready",
      label: "Gmail 実送信準備完了（real + SMTP + TEST_TO）",
      ok: gmailRuntimeOk,
      status: gmailRuntimeOk ? "GREEN" : "RED",
      detail: gmailRuntimeOk
        ? "login → POST /api/notifications/test-email で確認"
        : "SMTP_PASS または NOTIFICATION_TEST_TO を .env に設定",
    },
  ];

  const checks = [...base.checks, ...gmailChecks];
  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);

  const criticalIds = [
    "admin-password-hash-runtime",
    "gmail-smtp-runtime",
    "notification-test-to-env",
    "notification-test-email-route",
    "gmail-send-ready",
  ];
  const criticalOk = checks.filter((c) => criticalIds.includes(c.id)).every((c) => c.ok);

  const implemented = [
    ...base.implemented,
    "GET /api/notifications/stats — gmailMode / smtpConfigured / lastSendStatus",
    "POST /api/notifications/test-email — admin Bearer + NOTIFICATION_TEST_TO",
    "Gmail SMTP real（SMTP_USER + アプリパスワード SMTP_PASS）",
    "scripts/phase2383-gmail-verify.sh — login → test-email 一括確認",
  ];

  const mockRemaining = [
    "Business Gmail OAuth 実送信（営業 PDF 添付メール）",
    "QNAP 実機 WebDAV/SMB アップロード（QNAP_MODE=real）",
    "Shelly 実機 RPC（SHELLY_MODE=real）",
  ];

  return {
    phase: "2383",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady: criticalOk && base.adminPasswordStatus === "GREEN" && productionRatePercent >= 85,
    adminPasswordStatus: base.adminPasswordStatus,
    gmailInfraStatus: gmail.infraStatus,
    gmailMode: gmail.gmailMode,
    smtpConfigured: gmail.smtpConfigured,
    notificationTestToConfigured: Boolean(testTo),
    maskedCredentials: gmail.maskedCredentials,
    lastSendStatus: getLastGmailSendStatus(),
    implemented,
    mockRemaining,
    nextPhase: "2401-2420 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}

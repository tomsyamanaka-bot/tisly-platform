/**
 * Phase 2384 — Gmail 実送信確認（test-email 成功 + lastSendStatus=sent）
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import { getGmailSmtpStatus } from "../notification/smtp-gmail.js";
import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import { buildPhase2383ProductionCheck } from "./phase2383-production-check.js";
import { getRepoRoot } from "./server-paths.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";

export interface Phase2384ProductionReport {
  phase: "2384";
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
  gmailSendVerified: boolean;
  lastTestEmailOk: boolean;
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

export function buildPhase2384ProductionCheck(
  env: NodeJS.ProcessEnv = process.env
): Phase2384ProductionReport {
  const base2383 = buildPhase2383ProductionCheck(env);
  const repoRoot = getRepoRoot();

  const verifyPs1 = readText(path.join(repoRoot, "scripts/phase2384-gmail-verify.ps1")) ?? "";
  const verifySh = readText(path.join(repoRoot, "scripts/phase2384-gmail-verify.sh")) ?? "";

  const gmail = getGmailSmtpStatus(env);
  const lastSend = getLastGmailSendStatus();

  const realSendRequired = gmail.gmailMode === "real";
  const lastTestEmailOk = realSendRequired
    ? lastSend.status === "sent"
    : lastSend.status === "sent" || lastSend.status === "mock";
  const gmailSendVerified = lastTestEmailOk && Boolean(lastSend.createdAt);

  const sendChecks: ProductionCheckItem[] = [
    {
      id: "gmail-last-send-recorded",
      label: "Gmail 送信ログ記録（lastSendStatus あり）",
      ok: Boolean(lastSend.createdAt),
      status: lastSend.createdAt ? "GREEN" : "RED",
      detail: lastSend.createdAt
        ? `最終: ${lastSend.status} @ ${lastSend.createdAt}`
        : "test-email 未実行 — POST /api/notifications/test-email を実行",
    },
    {
      id: "gmail-test-email-sent",
      label: "Gmail test-email 成功（status=sent）",
      ok: lastSend.status === "sent",
      status:
        lastSend.status === "sent"
          ? "GREEN"
          : lastSend.status === "mock"
            ? "YELLOW"
            : "RED",
      detail:
        lastSend.status === "sent"
          ? `宛先マスク済み · subject=${lastSend.subject ?? "—"}`
          : realSendRequired
            ? "real モード — sent になるまで test-email を再実行"
            : `status=${lastSend.status ?? "null"}`,
    },
    {
      id: "gmail-real-send-verified",
      label: "Gmail 実送信確認完了（real + sent）",
      ok: !realSendRequired || lastSend.status === "sent",
      status:
        !realSendRequired
          ? "YELLOW"
          : lastSend.status === "sent"
            ? "GREEN"
            : "RED",
      detail: realSendRequired
        ? lastSend.status === "sent"
          ? "SMTP 経由の実メール送信済み"
          : "NOTIFICATION_TEST_TO 宛に test-email を送信してください"
        : "mock モード — 実送信はスキップ可",
    },
    {
      id: "scripts-phase2384-verify",
      label: "scripts/phase2384-gmail-verify — 一括確認スクリプト",
      ok: verifyPs1.includes("test-email") && verifySh.includes("test-email"),
      status: verifyPs1.includes("test-email") ? "GREEN" : "RED",
    },
  ];

  const checks = [...base2383.checks, ...sendChecks];
  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);

  const criticalIds = [
    "admin-password-hash-runtime",
    "gmail-smtp-runtime",
    "notification-test-to-env",
    "gmail-test-email-sent",
    "gmail-real-send-verified",
  ];
  const criticalOk = checks.filter((c) => criticalIds.includes(c.id)).every((c) => c.ok);

  const implemented = [
    ...base2383.implemented,
    "Phase 2384 — test-email 実送信 → lastSendStatus=sent 確認",
    "scripts/phase2384-gmail-verify.ps1 / .sh — login → test-email → stats → production-check",
    "App Hub「Gmail通知テスト」カード — ブラウザから送信確認",
  ];

  return {
    phase: "2384",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady:
      criticalOk && base2383.adminPasswordStatus === "GREEN" && gmailSendVerified,
    adminPasswordStatus: base2383.adminPasswordStatus,
    gmailInfraStatus: gmail.infraStatus,
    gmailMode: gmail.gmailMode,
    smtpConfigured: gmail.smtpConfigured,
    notificationTestToConfigured: base2383.notificationTestToConfigured,
    gmailSendVerified,
    lastTestEmailOk,
    maskedCredentials: gmail.maskedCredentials,
    lastSendStatus: lastSend,
    implemented,
    mockRemaining: base2383.mockRemaining,
    nextPhase: "2401-2420 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}

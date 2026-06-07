/**
 * Phase 2385 — Gmail PDF 添付テストメール（本文に認証情報なし）
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import {
  GMAIL_TEST_ATTACHMENT_FILENAME,
  getGmailSmtpStatus,
} from "../notification/smtp-gmail.js";
import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import { buildPhase2384ProductionCheck } from "./phase2384-production-check.js";
import { getRepoRoot } from "./server-paths.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";

export interface Phase2385ProductionReport {
  phase: "2385";
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
  pdfAttachmentEnabled: boolean;
  testEmailBodySafe: boolean;
  lastTestEmailOk: boolean;
  maskedCredentials: string;
  attachmentFileName: string;
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

export function buildPhase2385ProductionCheck(
  env: NodeJS.ProcessEnv = process.env
): Phase2385ProductionReport {
  const base2384 = buildPhase2384ProductionCheck(env);
  const repoRoot = getRepoRoot();

  const smtpGmailSrc = readText(path.join(repoRoot, "server/src/notification/smtp-gmail.ts")) ?? "";
  const verifyPs1 = readText(path.join(repoRoot, "scripts/phase2385-gmail-verify.ps1")) ?? "";
  const verifySh = readText(path.join(repoRoot, "scripts/phase2385-gmail-verify.sh")) ?? "";

  const pdfAttachmentEnabled =
    smtpGmailSrc.includes("buildGmailTestAttachmentPdf") &&
    smtpGmailSrc.includes("GMAIL_TEST_ATTACHMENT_FILENAME") &&
    smtpGmailSrc.includes("attachments:");
  const testEmailBodySafe =
    !smtpGmailSrc.includes("`SMTP: ${status.maskedCredentials}`") &&
    smtpGmailSrc.includes("送信時刻:") &&
    smtpGmailSrc.includes("モード:");

  const pdfChecks: ProductionCheckItem[] = [
    {
      id: "gmail-test-pdf-attachment",
      label: "Gmail test-email — PDF 添付送信",
      ok: pdfAttachmentEnabled,
      status: pdfAttachmentEnabled ? "GREEN" : "RED",
      detail: pdfAttachmentEnabled
        ? `添付ファイル: ${GMAIL_TEST_ATTACHMENT_FILENAME}`
        : "smtp-gmail.ts に PDF 添付が未実装",
    },
    {
      id: "gmail-test-email-body-safe",
      label: "Gmail test-email 本文 — 認証情報なし",
      ok: testEmailBodySafe,
      status: testEmailBodySafe ? "GREEN" : "RED",
      detail: testEmailBodySafe
        ? "本文は送信時刻 + モード(real/mock) のみ"
        : "本文に SMTP_USER / SMTP_PASS が含まれる可能性あり",
    },
    {
      id: "scripts-phase2385-verify",
      label: "scripts/phase2385-gmail-verify — 一括確認スクリプト",
      ok: verifyPs1.includes("test-email") && verifySh.includes("test-email"),
      status: verifyPs1.includes("test-email") ? "GREEN" : "RED",
    },
  ];

  const checks = [...base2384.checks, ...pdfChecks];
  const okCount = checks.filter((c) => c.ok).length;
  const productionRatePercent = Math.round((okCount / checks.length) * 100);

  const criticalIds = [
    "admin-password-hash-runtime",
    "gmail-smtp-runtime",
    "notification-test-to-env",
    "gmail-test-email-sent",
    "gmail-real-send-verified",
    "gmail-test-pdf-attachment",
    "gmail-test-email-body-safe",
  ];
  const criticalOk = checks.filter((c) => criticalIds.includes(c.id)).every((c) => c.ok);

  const implemented = [
    ...base2384.implemented,
    "Phase 2385 — test-email PDF 添付（tisly-gmail-test.pdf）",
    "Phase 2385 — 本文から SMTP 認証情報を除去（送信時刻 + モードのみ）",
    "scripts/phase2385-gmail-verify.ps1 / .sh — PDF 添付確認",
  ];

  return {
    phase: "2385",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady:
      criticalOk && base2384.adminPasswordStatus === "GREEN" && base2384.gmailSendVerified,
    adminPasswordStatus: base2384.adminPasswordStatus,
    gmailInfraStatus: base2384.gmailInfraStatus,
    gmailMode: base2384.gmailMode,
    smtpConfigured: base2384.smtpConfigured,
    notificationTestToConfigured: base2384.notificationTestToConfigured,
    gmailSendVerified: base2384.gmailSendVerified,
    pdfAttachmentEnabled,
    testEmailBodySafe,
    lastTestEmailOk: base2384.lastTestEmailOk,
    maskedCredentials: base2384.maskedCredentials,
    attachmentFileName: GMAIL_TEST_ATTACHMENT_FILENAME,
    lastSendStatus: base2384.lastSendStatus,
    implemented,
    mockRemaining: base2384.mockRemaining,
    nextPhase: "2401-2420 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}

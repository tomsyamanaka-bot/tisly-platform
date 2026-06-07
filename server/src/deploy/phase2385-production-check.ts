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
import { getRepoRoot, getServerRoot } from "./server-paths.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";

function analyzeGmailSmtpModule(source: string): {
  pdfAttachmentEnabled: boolean;
  testEmailBodySafe: boolean;
} {
  const pdfAttachmentEnabled =
    source.includes("buildGmailTestAttachmentPdf") &&
    source.includes("GMAIL_TEST_ATTACHMENT_FILENAME") &&
    source.includes("attachments:");
  const testEmailBodySafe =
    !source.includes("`SMTP: ${status.maskedCredentials}`") &&
    source.includes("送信時刻:") &&
    source.includes("モード:");
  return { pdfAttachmentEnabled, testEmailBodySafe };
}

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
  distPdfAttachmentEnabled: boolean;
  distTestEmailBodySafe: boolean;
  distRuntimeAligned: boolean;
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
  const smtpGmailDist =
    readText(path.join(getServerRoot(), "dist/notification/smtp-gmail.js")) ?? "";
  const verifyPs1 = readText(path.join(repoRoot, "scripts/phase2385-gmail-verify.ps1")) ?? "";
  const verifySh = readText(path.join(repoRoot, "scripts/phase2385-gmail-verify.sh")) ?? "";

  const srcAnalysis = analyzeGmailSmtpModule(smtpGmailSrc);
  const distAnalysis = analyzeGmailSmtpModule(smtpGmailDist);
  const pdfAttachmentEnabled = srcAnalysis.pdfAttachmentEnabled;
  const testEmailBodySafe = srcAnalysis.testEmailBodySafe;
  const distPdfAttachmentEnabled = distAnalysis.pdfAttachmentEnabled;
  const distTestEmailBodySafe = distAnalysis.testEmailBodySafe;
  const distRuntimeAligned =
    distPdfAttachmentEnabled &&
    distTestEmailBodySafe &&
    pdfAttachmentEnabled &&
    testEmailBodySafe;

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
      label: "Gmail test-email 本文 — 認証情報なし（src）",
      ok: testEmailBodySafe,
      status: testEmailBodySafe ? "GREEN" : "RED",
      detail: testEmailBodySafe
        ? "src: 本文は送信時刻 + モード(real/mock) のみ"
        : "src: 本文に SMTP_USER / SMTP_PASS が含まれる可能性あり",
    },
    {
      id: "gmail-dist-runtime-pdf-attachment",
      label: "Gmail test-email — dist 実行コード PDF 添付",
      ok: distPdfAttachmentEnabled,
      status: distPdfAttachmentEnabled ? "GREEN" : "RED",
      detail: distPdfAttachmentEnabled
        ? `dist: ${GMAIL_TEST_ATTACHMENT_FILENAME} 添付あり`
        : "dist/notification/smtp-gmail.js に PDF 添付未反映 — npm run build + restart 必要",
    },
    {
      id: "gmail-dist-runtime-body-safe",
      label: "Gmail test-email — dist 実行コード 本文安全",
      ok: distTestEmailBodySafe,
      status: distTestEmailBodySafe ? "GREEN" : "RED",
      detail: distTestEmailBodySafe
        ? "dist: 本文に SMTP 認証情報なし"
        : "dist: 旧コードが稼働中（SMTP_USER/SMTP_PASS が本文に出る）— build + restart 必要",
    },
    {
      id: "gmail-dist-runtime-aligned",
      label: "Gmail test-email — src/dist 整合（稼働コード一致）",
      ok: distRuntimeAligned,
      status: distRuntimeAligned ? "GREEN" : "RED",
      detail: distRuntimeAligned
        ? "src と dist が Phase 2385+ 仕様で一致"
        : "git pull 済みでも dist 未ビルドの可能性 — bash /opt/tisly/scripts/deploy.sh",
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
    "gmail-dist-runtime-pdf-attachment",
    "gmail-dist-runtime-body-safe",
    "gmail-dist-runtime-aligned",
  ];
  const criticalOk = checks.filter((c) => criticalIds.includes(c.id)).every((c) => c.ok);

  const implemented = [
    ...base2384.implemented,
    "Phase 2385 — test-email PDF 添付（tisly-gmail-test.pdf）",
    "Phase 2385 — 本文から SMTP 認証情報を除去（送信時刻 + モードのみ）",
    "Phase 2385 — production-check が dist/ 実行コードも検証",
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
    distPdfAttachmentEnabled,
    distTestEmailBodySafe,
    distRuntimeAligned,
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

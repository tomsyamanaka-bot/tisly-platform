/**
 * Phase 2386 — App Hub Gmail テスト UI（単一モーダル・admin 固定）
 */
import fs from "fs";
import path from "path";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
import {
  GMAIL_TEST_ATTACHMENT_FILENAME,
  getGmailSmtpStatus,
} from "../notification/smtp-gmail.js";
import { getLastGmailSendStatus } from "../notification/gmail-send-log.js";
import { buildPhase2385ProductionCheck } from "./phase2385-production-check.js";
import { getRepoRoot } from "./server-paths.js";
import type { ProductionCheckItem, ProductionCheckStatus } from "./phase2381-production-check.js";

export interface Phase2386ProductionReport {
  phase: "2386";
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
  gmailTestModalUi: boolean;
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

export function buildPhase2386ProductionCheck(
  env: NodeJS.ProcessEnv = process.env
): Phase2386ProductionReport {
  const base2385 = buildPhase2385ProductionCheck(env);
  const repoRoot = getRepoRoot();

  const appHubHtml = readText(path.join(repoRoot, "server/public/app-hub.html")) ?? "";
  const appHubJs = readText(path.join(repoRoot, "server/public/js/app-hub.js")) ?? "";
  const appHubCss = readText(path.join(repoRoot, "server/public/css/app-hub.css")) ?? "";

  const gmailTestModalUi =
    appHubHtml.includes("gmail-auth-modal") &&
    appHubHtml.includes("gmail-auth-password") &&
    appHubHtml.includes("管理者パスワード") &&
    appHubJs.includes("openGmailAuthModal") &&
    appHubJs.includes('const GMAIL_TEST_ADMIN_USER = "admin"') &&
    !appHubJs.includes('window.prompt("管理者') &&
    appHubCss.includes("gmail-auth-modal");

  const uiChecks: ProductionCheckItem[] = [
    {
      id: "app-hub-gmail-auth-modal",
      label: "App Hub Gmail テスト — 単一モーダル（admin 固定 + パスワード）",
      ok: gmailTestModalUi,
      status: gmailTestModalUi ? "GREEN" : "RED",
      detail: gmailTestModalUi
        ? "prompt 2回 → モーダル1回（管理者ユーザー名=admin 固定）"
        : "app-hub.html/js に gmail-auth-modal が未実装、または prompt 残存",
    },
  ];

  const checks = [...base2385.checks, ...uiChecks];
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
    "app-hub-gmail-auth-modal",
  ];
  const criticalOk = checks.filter((c) => criticalIds.includes(c.id)).every((c) => c.ok);

  const implemented = [
    ...base2385.implemented,
    "Phase 2386 — Gmail テスト送信 UI: 単一モーダル（admin 固定 + 管理者パスワード）",
    "Phase 2386 — window.prompt 2回を廃止",
  ];

  return {
    phase: "2386",
    ready: checks.every((c) => c.ok),
    shellVersion: PWA_SHELL_VERSION,
    shellTag: PWA_SHELL_TAG,
    productionRatePercent,
    operationalReady:
      criticalOk && base2385.adminPasswordStatus === "GREEN" && base2385.gmailSendVerified,
    adminPasswordStatus: base2385.adminPasswordStatus,
    gmailInfraStatus: base2385.gmailInfraStatus,
    gmailMode: base2385.gmailMode,
    smtpConfigured: base2385.smtpConfigured,
    notificationTestToConfigured: base2385.notificationTestToConfigured,
    gmailSendVerified: base2385.gmailSendVerified,
    pdfAttachmentEnabled: base2385.pdfAttachmentEnabled,
    testEmailBodySafe: base2385.testEmailBodySafe,
    gmailTestModalUi,
    lastTestEmailOk: base2385.lastTestEmailOk,
    maskedCredentials: base2385.maskedCredentials,
    attachmentFileName: GMAIL_TEST_ATTACHMENT_FILENAME,
    lastSendStatus: base2385.lastSendStatus,
    implemented,
    mockRemaining: base2385.mockRemaining,
    nextPhase: "2401-2420 — Business Gmail OAuth 統合・QNAP/Shelly 実機検証",
    checks,
  };
}

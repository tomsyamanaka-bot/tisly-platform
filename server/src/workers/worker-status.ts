import { billingPublicStatus, isStripeConfigured } from "../billing/stripe-client.js";
import { countPendingNotificationQueue, countPendingWebhookDeliveries } from "./notification-worker.js";
import { countPendingReportEmails } from "../reports/report-email-queue.js";
import { isPdfPuppeteerEnabled } from "../reports/pdf/pdf-options.js";
import { getPlatformSetting } from "../db/database.js";

let lastTickAt: string | null = null;
let lastTickResult: Record<string, unknown> | null = null;
let workerRunning = false;

export function recordWorkerTick(result: Record<string, unknown>): void {
  lastTickAt = new Date().toISOString();
  lastTickResult = result;
}

export function setWorkerRunning(running: boolean): void {
  workerRunning = running;
}

export function getWorkerStatus() {
  const emailSettings = getPlatformSetting<{ enabled?: boolean; smtpHost?: string }>("email");
  const smtpConfigured = Boolean(
    process.env.SMTP_USER?.trim() &&
      (process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim())
  );
  return {
    running: workerRunning,
    lastTickAt,
    lastTickResult,
    queues: {
      notification: countPendingNotificationQueue(),
      webhook: countPendingWebhookDeliveries(),
      reportEmail: countPendingReportEmails(),
    },
    billing: billingPublicStatus(),
    stripeConfigured: isStripeConfigured(),
    smtpConfigured,
    puppeteerEnabled: isPdfPuppeteerEnabled(),
    pdfFallback: !isPdfPuppeteerEnabled() ? "html-placeholder" : "puppeteer-or-fallback",
  };
}

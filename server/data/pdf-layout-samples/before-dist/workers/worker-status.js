import { billingPublicStatus, isStripeConfigured } from "../billing/stripe-client.js";
import { countPendingNotificationQueue, countPendingWebhookDeliveries } from "./notification-worker.js";
import { countPendingReportEmails } from "../reports/report-email-queue.js";
import { isPdfPuppeteerEnabled } from "../reports/pdf/pdf-options.js";
import { getPlatformSetting } from "../db/database.js";
let lastTickAt = null;
let lastTickResult = null;
let workerRunning = false;
export function recordWorkerTick(result) {
    lastTickAt = new Date().toISOString();
    lastTickResult = result;
}
export function setWorkerRunning(running) {
    workerRunning = running;
}
export function getWorkerStatus() {
    const emailSettings = getPlatformSetting("email");
    const smtpConfigured = Boolean(process.env.SMTP_USER?.trim() &&
        (process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim()));
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

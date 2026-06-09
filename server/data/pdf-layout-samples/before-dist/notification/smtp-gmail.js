/**
 * Phase 2301–2350 — Gmail SMTP（アプリパスワード）送信
 */
import nodemailer from "nodemailer";
import { logGmailSend } from "./gmail-send-log.js";
function smtpHost(env = process.env) {
    return (env.SMTP_HOST ?? "smtp.gmail.com").trim();
}
function smtpPort(env = process.env) {
    return Number(env.SMTP_PORT ?? "587");
}
function smtpUser(env = process.env) {
    return (env.SMTP_USER ?? "").trim();
}
function smtpPass(env = process.env) {
    return (env.SMTP_PASS ?? env.SMTP_PASSWORD ?? "").trim();
}
export function getGmailNotificationMode(env = process.env) {
    const raw = (env.GMAIL_SEND_MODE ?? "mock").toLowerCase();
    return raw === "real" ? "real" : "mock";
}
export function isSmtpGmailConfigured(env = process.env) {
    return Boolean(smtpUser(env) && smtpPass(env) && smtpHost(env));
}
export function maskSmtpCredentials(env = process.env) {
    const user = smtpUser(env) || "(unset)";
    return `SMTP_USER=${user} / SMTP_PASS=****`;
}
export function getGmailSmtpStatus(env = process.env) {
    const gmailMode = getGmailNotificationMode(env);
    const smtpConfigured = isSmtpGmailConfigured(env);
    const maskedCredentials = maskSmtpCredentials(env);
    if (gmailMode === "mock") {
        return {
            gmailMode,
            smtpConfigured,
            statusLabel: "mock",
            infraStatus: "YELLOW",
            maskedCredentials,
        };
    }
    if (!smtpConfigured) {
        return {
            gmailMode,
            smtpConfigured,
            statusLabel: "Gmail not configured",
            infraStatus: "YELLOW",
            maskedCredentials,
        };
    }
    return {
        gmailMode,
        smtpConfigured,
        statusLabel: "ready",
        infraStatus: "GREEN",
        maskedCredentials,
    };
}
export function logGmailStartupStatus() {
    const status = getGmailSmtpStatus();
    if (status.gmailMode === "real" && !status.smtpConfigured) {
        console.warn(`[TiSLY/YELLOW] Gmail not configured — ${status.maskedCredentials} (SMTP_PASS required)`);
        return;
    }
    if (status.gmailMode === "real") {
        console.log(`[TiSLY/Gmail] real mode — ${status.maskedCredentials}`);
        return;
    }
    console.log("[TiSLY/Gmail] mock mode — notification emails are not delivered");
}
/** Phase 2385 — テスト送信用ミニマル PDF */
export function buildGmailTestAttachmentPdf() {
    const text = "TiSLY Gmail Notification Test PDF";
    const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${text.length + 50} >>stream
BT /F1 12 Tf 50 700 Td (${text}) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
trailer<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;
    return Buffer.from(pdf, "utf8");
}
export const GMAIL_TEST_ATTACHMENT_FILENAME = "tisly-gmail-test.pdf";
export async function sendSmtpGmailMail(input) {
    const mode = getGmailNotificationMode();
    const sendType = input.sendType ?? "notification";
    if (mode === "mock") {
        const attNote = input.attachments?.length
            ? ` (+${input.attachments.length} attachment(s))`
            : "";
        console.log(`[Gmail/mock] → ${input.to}: ${input.subject}${attNote}`);
        const logId = input.skipLog
            ? undefined
            : logGmailSend({
                recipient: input.to,
                subject: input.subject,
                sendType,
                status: "mock",
                mock: true,
            });
        return { ok: true, messageId: "mock", logId, mock: true };
    }
    if (!isSmtpGmailConfigured()) {
        const error = "Gmail not configured — SMTP_PASS required";
        const logId = input.skipLog
            ? undefined
            : logGmailSend({
                recipient: input.to,
                subject: input.subject,
                sendType,
                status: "failed",
                errorMessage: error,
            });
        return { ok: false, error, logId };
    }
    try {
        const port = smtpPort();
        const transporter = nodemailer.createTransport({
            host: smtpHost(),
            port,
            secure: port === 465,
            auth: { user: smtpUser(), pass: smtpPass() },
        });
        const info = await transporter.sendMail({
            from: smtpUser(),
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
            attachments: input.attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType ?? "application/pdf",
            })),
        });
        const attNote = input.attachments?.length
            ? ` (+${input.attachments.length} attachment(s))`
            : "";
        console.log(`[Gmail/real] → ${input.to}: sent${attNote}`);
        const logId = input.skipLog
            ? undefined
            : logGmailSend({
                recipient: input.to,
                subject: input.subject,
                sendType,
                status: "sent",
            });
        return { ok: true, messageId: info.messageId, logId };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Gmail/real] → ${input.to}: failed`);
        const logId = input.skipLog
            ? undefined
            : logGmailSend({
                recipient: input.to,
                subject: input.subject,
                sendType,
                status: "failed",
                errorMessage: msg,
            });
        return { ok: false, error: msg, logId };
    }
}
export async function sendGmailTestEmail(to) {
    const status = getGmailSmtpStatus();
    const subject = "[TiSLY] Gmail 通知テスト";
    const text = [
        "TiSLY Gmail 通知テストメールです。",
        "",
        `送信時刻: ${new Date().toISOString()}`,
        `モード: ${status.gmailMode}`,
    ].join("\n");
    const result = await sendSmtpGmailMail({
        to,
        subject,
        text,
        sendType: "test",
        attachments: [
            {
                filename: GMAIL_TEST_ATTACHMENT_FILENAME,
                content: buildGmailTestAttachmentPdf(),
                contentType: "application/pdf",
            },
        ],
    });
    return {
        ok: result.ok,
        error: result.error,
        logId: result.logId,
        mock: result.mock,
        gmailMode: status.gmailMode,
        smtpConfigured: status.smtpConfigured,
        maskedCredentials: status.maskedCredentials,
        attachmentFileName: GMAIL_TEST_ATTACHMENT_FILENAME,
        attachmentIncluded: true,
    };
}

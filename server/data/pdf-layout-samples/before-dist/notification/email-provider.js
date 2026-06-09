/**
 * Phase 2301–2350 — 通知メール Provider 抽象（mock / smtp / gmail SMTP）
 */
import nodemailer from "nodemailer";
import { getPlatformSetting } from "../db/database.js";
import { getGmailSendMode } from "../business/services/gmailRealSend.js";
import { getGmailNotificationMode, isSmtpGmailConfigured, maskSmtpCredentials, sendSmtpGmailMail, } from "./smtp-gmail.js";
export function getEmailProviderMode() {
    const explicit = (process.env.NOTIFICATION_EMAIL_MODE ?? "").toLowerCase();
    if (explicit === "mock" || explicit === "smtp" || explicit === "gmail") {
        return explicit;
    }
    const gmailMode = getGmailSendMode();
    if (gmailMode === "real")
        return "gmail";
    if (gmailMode === "dryRun")
        return "mock";
    return "mock";
}
class MockEmailProvider {
    mode = "mock";
    async send(payload) {
        console.log(`[Notification/mock] email: ${payload.title}`);
        return { channel: "email", success: true };
    }
}
class SmtpEmailProvider {
    mode = "smtp";
    async send(payload) {
        const settings = getPlatformSetting("email");
        if (!settings?.enabled || !settings.adminEmail) {
            return { channel: "email", success: false, error: "Email disabled or no recipient" };
        }
        try {
            const transporter = nodemailer.createTransport({
                host: settings.smtpHost,
                port: settings.smtpPort,
                secure: settings.smtpPort === 465,
                auth: settings.smtpUser
                    ? { user: settings.smtpUser, pass: settings.smtpPassword ?? process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD }
                    : undefined,
            });
            await transporter.sendMail({
                from: settings.fromAddress,
                to: settings.adminEmail,
                subject: `[TiSLY] ${payload.title}`,
                text: `${payload.body}\n\nイベント: ${payload.eventType}\nデバイス: ${payload.deviceId ?? "-"}`,
                html: `<h2>${payload.title}</h2><p>${payload.body ?? ""}</p>`,
            });
            return { channel: "email", success: true };
        }
        catch (err) {
            return {
                channel: "email",
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
class GmailSmtpEmailProvider {
    mode = "gmail";
    async send(payload) {
        const settings = getPlatformSetting("email");
        const to = settings?.adminEmail ??
            process.env.NOTIFICATION_GMAIL_TO ??
            process.env.ADMIN_EMAIL ??
            "";
        if (!to) {
            return { channel: "email", success: false, error: "adminEmail / NOTIFICATION_GMAIL_TO required" };
        }
        const notifyMode = getGmailNotificationMode();
        if (notifyMode === "real" && !isSmtpGmailConfigured()) {
            console.warn(`[Gmail/YELLOW] not configured — ${maskSmtpCredentials()}`);
            const result = await sendSmtpGmailMail({
                to,
                subject: `[TiSLY] ${payload.title}`,
                text: `${payload.body ?? ""}\n\nイベント: ${payload.eventType}\nデバイス: ${payload.deviceId ?? "-"}`,
                sendType: "notification",
            });
            return {
                channel: "email",
                success: result.ok,
                error: result.error,
            };
        }
        const result = await sendSmtpGmailMail({
            to,
            subject: `[TiSLY] ${payload.title}`,
            text: `${payload.body ?? ""}\n\nイベント: ${payload.eventType}\nデバイス: ${payload.deviceId ?? "-"}`,
            html: `<h2>${payload.title}</h2><p>${payload.body ?? ""}</p>`,
            sendType: "notification",
        });
        return {
            channel: "email",
            success: result.ok,
            error: result.error,
        };
    }
}
let providerInstance = null;
export function getEmailNotificationProvider() {
    if (providerInstance)
        return providerInstance;
    const mode = getEmailProviderMode();
    if (mode === "smtp")
        providerInstance = new SmtpEmailProvider();
    else if (mode === "gmail")
        providerInstance = new GmailSmtpEmailProvider();
    else
        providerInstance = new MockEmailProvider();
    return providerInstance;
}
export function resetEmailNotificationProvider() {
    providerInstance = null;
}
export async function sendEmailViaProvider(payload) {
    return getEmailNotificationProvider().send(payload);
}

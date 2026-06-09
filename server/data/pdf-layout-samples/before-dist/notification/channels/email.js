import nodemailer from "nodemailer";
import { v4 as uuid } from "uuid";
import { getDatabase, getPlatformSetting } from "../../db/database.js";
function getTransporter(settings) {
    return nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpPort === 465,
        auth: settings.smtpUser
            ? { user: settings.smtpUser, pass: settings.smtpPassword ?? process.env.SMTP_PASSWORD }
            : undefined,
    });
}
export async function sendEmail(payload) {
    const { sendEmailViaProvider } = await import("../email-provider.js");
    return sendEmailViaProvider(payload);
}
export async function sendReportEmail(input) {
    const settings = getPlatformSetting("email");
    if (!settings?.enabled) {
        return { ok: false, error: "Email disabled — placeholder only" };
    }
    try {
        const transporter = getTransporter({
            ...settings,
            smtpPassword: process.env.SMTP_PASSWORD,
        });
        await transporter.sendMail({
            from: settings.fromAddress,
            to: input.to,
            subject: input.subject,
            html: input.html,
            attachments: input.attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
            })),
        });
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
export async function resendNotificationLog(logId) {
    const db = getDatabase();
    const log = db
        .prepare("SELECT * FROM notification_logs WHERE id = ?")
        .get(logId);
    if (!log) {
        return { channel: "email", success: false, error: "Log not found" };
    }
    const payload = {
        title: log.title,
        body: log.body ?? "",
        eventType: log.event_type,
        deviceId: log.device_id,
    };
    if (log.channel === "discord") {
        const { sendDiscord } = await import("./discord.js");
        return sendDiscord(payload);
    }
    if (log.channel === "web_push") {
        const { sendWebPush } = await import("./web-push.js");
        return sendWebPush(payload);
    }
    return sendEmail(payload);
}
export function queueFailedDelivery(logId, channel, payload) {
    const db = getDatabase();
    db.prepare(`INSERT INTO notification_queue (id, log_id, channel, payload_json, status)
     VALUES (?, ?, ?, ?, 'queued')`).run(uuid(), logId, channel, JSON.stringify(payload));
}

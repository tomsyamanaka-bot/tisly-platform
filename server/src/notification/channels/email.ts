import nodemailer from "nodemailer";
import { v4 as uuid } from "uuid";
import { getDatabase, getPlatformSetting } from "../../db/database.js";
import type { NotificationPayload } from "../types.js";
import type { DeliveryResult } from "../types.js";

interface EmailSettings {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword?: string;
  fromAddress: string;
  adminEmail: string;
}

function getTransporter(settings: EmailSettings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpPort === 465,
    auth: settings.smtpUser
      ? { user: settings.smtpUser, pass: settings.smtpPassword ?? process.env.SMTP_PASSWORD }
      : undefined,
  });
}

export async function sendEmail(payload: NotificationPayload): Promise<DeliveryResult> {
  const settings = getPlatformSetting<EmailSettings>("email");
  if (!settings?.enabled || !settings.adminEmail) {
    return { channel: "email", success: false, error: "Email disabled or no recipient" };
  }

  try {
    const transporter = getTransporter({
      ...settings,
      smtpPassword: process.env.SMTP_PASSWORD,
    });
    await transporter.sendMail({
      from: settings.fromAddress,
      to: settings.adminEmail,
      subject: `[TiSLY] ${payload.title}`,
      text: `${payload.body}\n\nイベント: ${payload.eventType}\nデバイス: ${payload.deviceId ?? "-"}`,
      html: `<h2>${payload.title}</h2><p>${payload.body ?? ""}</p><p><b>イベント:</b> ${payload.eventType}<br><b>デバイス:</b> ${payload.deviceId ?? "-"}</p>`,
    });
    return { channel: "email", success: true };
  } catch (err) {
    return {
      channel: "email",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function resendNotificationLog(logId: string): Promise<DeliveryResult> {
  const db = getDatabase();
  const log = db
    .prepare("SELECT * FROM notification_logs WHERE id = ?")
    .get(logId) as {
    title: string;
    body: string;
    event_type: string;
    device_id: string;
    channel: string;
  } | undefined;
  if (!log) {
    return { channel: "email", success: false, error: "Log not found" };
  }
  const payload: NotificationPayload = {
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

export function queueFailedDelivery(
  logId: string,
  channel: string,
  payload: NotificationPayload
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO notification_queue (id, log_id, channel, payload_json, status)
     VALUES (?, ?, ?, ?, 'queued')`
  ).run(uuid(), logId, channel, JSON.stringify(payload));
}

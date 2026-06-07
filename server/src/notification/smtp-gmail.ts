/**
 * Phase 2301–2350 — Gmail SMTP（アプリパスワード）送信
 */
import nodemailer from "nodemailer";
import { logGmailSend } from "./gmail-send-log.js";

export type GmailNotificationMode = "mock" | "real";

function smtpHost(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SMTP_HOST ?? "smtp.gmail.com").trim();
}

function smtpPort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.SMTP_PORT ?? "587");
}

function smtpUser(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SMTP_USER ?? "").trim();
}

function smtpPass(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SMTP_PASS ?? env.SMTP_PASSWORD ?? "").trim();
}

export function getGmailNotificationMode(env: NodeJS.ProcessEnv = process.env): GmailNotificationMode {
  const raw = (env.GMAIL_SEND_MODE ?? "mock").toLowerCase();
  return raw === "real" ? "real" : "mock";
}

export function isSmtpGmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(smtpUser(env) && smtpPass(env) && smtpHost(env));
}

export function maskSmtpCredentials(env: NodeJS.ProcessEnv = process.env): string {
  const user = smtpUser(env) || "(unset)";
  return `SMTP_USER=${user} / SMTP_PASS=****`;
}

export function getGmailSmtpStatus(env: NodeJS.ProcessEnv = process.env): {
  gmailMode: GmailNotificationMode;
  smtpConfigured: boolean;
  statusLabel: string;
  infraStatus: "GREEN" | "YELLOW" | "RED";
  maskedCredentials: string;
} {
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

export function logGmailStartupStatus(): void {
  const status = getGmailSmtpStatus();
  if (status.gmailMode === "real" && !status.smtpConfigured) {
    console.warn(
      `[TiSLY/YELLOW] Gmail not configured — ${status.maskedCredentials} (SMTP_PASS required)`
    );
    return;
  }
  if (status.gmailMode === "real") {
    console.log(`[TiSLY/Gmail] real mode — ${status.maskedCredentials}`);
    return;
  }
  console.log("[TiSLY/Gmail] mock mode — notification emails are not delivered");
}

export async function sendSmtpGmailMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sendType?: string;
  skipLog?: boolean;
}): Promise<{ ok: boolean; error?: string; messageId?: string; logId?: string; mock?: boolean }> {
  const mode = getGmailNotificationMode();
  const sendType = input.sendType ?? "notification";

  if (mode === "mock") {
    console.log(`[Gmail/mock] ${maskSmtpCredentials()} → ${input.to}: ${input.subject}`);
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
    });
    console.log(`[Gmail/real] ${maskSmtpCredentials()} → ${input.to}: sent`);
    const logId = input.skipLog
      ? undefined
      : logGmailSend({
          recipient: input.to,
          subject: input.subject,
          sendType,
          status: "sent",
        });
    return { ok: true, messageId: info.messageId, logId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Gmail/real] ${maskSmtpCredentials()} → ${input.to}: failed`);
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

export async function sendGmailTestEmail(to: string): Promise<{
  ok: boolean;
  error?: string;
  logId?: string;
  mock?: boolean;
  gmailMode: GmailNotificationMode;
  smtpConfigured: boolean;
  maskedCredentials: string;
}> {
  const status = getGmailSmtpStatus();
  const subject = "[TiSLY] Gmail 通知テスト";
  const text = [
    "TiSLY Gmail 通知テストメールです。",
    "",
    `送信時刻: ${new Date().toISOString()}`,
    `モード: ${status.gmailMode}`,
    `SMTP: ${status.maskedCredentials}`,
  ].join("\n");

  const result = await sendSmtpGmailMail({
    to,
    subject,
    text,
    sendType: "test",
  });

  return {
    ok: result.ok,
    error: result.error,
    logId: result.logId,
    mock: result.mock,
    gmailMode: status.gmailMode,
    smtpConfigured: status.smtpConfigured,
    maskedCredentials: status.maskedCredentials,
  };
}

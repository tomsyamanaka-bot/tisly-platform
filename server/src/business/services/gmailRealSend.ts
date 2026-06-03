import fs from "fs";
import path from "path";
import type { MailDraft } from "../business-types.js";
import { DEFAULT_MAIL_TO } from "../business-types.js";
import { logBusinessIntegration } from "../business-integration-log.js";
import { getGoogleOAuthConfig, refreshGoogleAccessToken } from "../../services/googleOAuthService.js";

export type GmailSendMode = "mock" | "dryRun" | "real";

export function getGmailSendMode(): GmailSendMode {
  const raw = (process.env.GMAIL_SEND_MODE ?? "mock").toLowerCase();
  if (raw === "real") return "real";
  if (raw === "dryrun" || raw === "dry_run") return "dryRun";
  return "mock";
}

export function canGmailRealSend(confirmed?: boolean): { ok: boolean; reason?: string } {
  if (process.env.GOOGLE_OAUTH_ENABLED !== "true") {
    return { ok: false, reason: "GOOGLE_OAUTH_ENABLED must be true" };
  }
  if (getGmailSendMode() !== "real") {
    return { ok: false, reason: "GMAIL_SEND_MODE must be real" };
  }
  if (!confirmed) {
    return { ok: false, reason: "confirmed=true required" };
  }
  const cfg = getGoogleOAuthConfig();
  if (cfg.mode !== "real" || !cfg.refreshToken) {
    return { ok: false, reason: "Google OAuth not connected" };
  }
  return { ok: true };
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function resolveAttachmentPath(attachPath: string): string | null {
  if (!attachPath || attachPath.includes("placeholder")) return null;
  const local = attachPath.startsWith("/")
    ? path.join(process.cwd(), attachPath.replace(/^\//, ""))
    : path.join(process.cwd(), attachPath);
  return fs.existsSync(local) ? local : null;
}

export function buildMultipartMime(
  to: string,
  subject: string,
  body: string,
  attachments: Array<{ fileName: string; content: Buffer; mimeType?: string }>
): string {
  const boundary = `tisly_${Date.now()}`;
  const subjectB64 = Buffer.from(subject).toString("base64");
  const lines: string[] = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${subjectB64}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64"),
  ];
  for (const att of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType ?? "application/pdf"}; name="${att.fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.fileName}"`,
      "",
      att.content.toString("base64")
    );
  }
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

export interface GmailRealSendPreview {
  to: string;
  subject: string;
  body: string;
  attachmentFileNames: string[];
}

export function previewGmailRealSend(draft: MailDraft): GmailRealSendPreview {
  const to = draft.to || DEFAULT_MAIL_TO;
  const names: string[] = [];
  for (const p of draft.attachmentPaths) {
    const local = resolveAttachmentPath(p);
    names.push(local ? path.basename(local) : path.basename(p));
  }
  return {
    to,
    subject: draft.subject,
    body: draft.body,
    attachmentFileNames: names,
  };
}

export interface GmailRealSendResult {
  processedMode: GmailSendMode;
  status: "sent" | "skipped" | "dry_run";
  messageId?: string;
  message: string;
}

export async function sendGmailRealWithDraft(
  draft: MailDraft,
  opts: { mode?: GmailSendMode; confirmed?: boolean; projectId?: string }
): Promise<GmailRealSendResult> {
  const mode = opts.mode ?? getGmailSendMode();
  const preview = previewGmailRealSend(draft);
  const logBase = {
    projectId: opts.projectId ?? draft.projectId,
    type: "gmail" as const,
    request: {
      op: "send-real",
      mode,
      to: preview.to,
      subject: preview.subject,
      attachments: preview.attachmentFileNames,
      confirmed: Boolean(opts.confirmed),
    },
  };

  if (mode === "mock") {
    logBusinessIntegration({
      ...logBase,
      provider: "mock",
      status: "skipped",
      response: { note: "mock mode — no delivery" },
    });
    return { processedMode: "mock", status: "skipped", message: "Mock: メールは送信されません" };
  }

  if (mode === "dryRun") {
    logBusinessIntegration({
      ...logBase,
      provider: "google",
      status: "skipped",
      response: { dryRun: true, preview },
    });
    return {
      processedMode: "dryRun",
      status: "dry_run",
      message: "Dry-run: 送信内容をログに記録しました（実送信なし）",
    };
  }

  const gate = canGmailRealSend(opts.confirmed);
  if (!gate.ok) {
    logBusinessIntegration({
      ...logBase,
      provider: "google",
      status: "skipped",
      errorMessage: gate.reason,
    });
    return { processedMode: "real", status: "skipped", message: gate.reason ?? "blocked" };
  }

  const attachments: Array<{ fileName: string; content: Buffer }> = [];
  for (const p of draft.attachmentPaths) {
    const local = resolveAttachmentPath(p);
    if (local) {
      attachments.push({ fileName: path.basename(local), content: fs.readFileSync(local) });
    }
  }
  if (!attachments.length) {
    attachments.push({
      fileName: "placeholder.pdf",
      content: Buffer.from("%PDF-1.4\n% TiSLY placeholder\n"),
    });
  }

  const rawMime = buildMultipartMime(preview.to, preview.subject, preview.body, attachments);
  const raw = base64UrlEncode(Buffer.from(rawMime, "utf8"));
  const token = await refreshGoogleAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    const msg = json.error?.message ?? `Gmail send failed (${res.status})`;
    logBusinessIntegration({
      ...logBase,
      provider: "google",
      status: "error",
      errorMessage: msg,
    });
    throw new Error(msg);
  }
  logBusinessIntegration({
    ...logBase,
    provider: "google",
    status: "success",
    response: { messageId: json.id, attachmentCount: attachments.length },
  });
  return {
    processedMode: "real",
    status: "sent",
    messageId: json.id,
    message: "Gmail送信完了",
  };
}

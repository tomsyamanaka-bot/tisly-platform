import type { MailDraft } from "../business-types.js";
export type GmailSendMode = "mock" | "dryRun" | "real";
export declare function getGmailSendMode(): GmailSendMode;
export declare function canGmailRealSend(confirmed?: boolean): {
    ok: boolean;
    reason?: string;
};
export declare function buildMultipartMime(to: string, subject: string, body: string, attachments: Array<{
    fileName: string;
    content: Buffer;
    mimeType?: string;
}>): string;
export interface GmailRealSendPreview {
    to: string;
    subject: string;
    body: string;
    attachmentFileNames: string[];
}
export declare function previewGmailRealSend(draft: MailDraft): GmailRealSendPreview;
export interface GmailRealSendResult {
    processedMode: GmailSendMode;
    status: "sent" | "skipped" | "dry_run";
    messageId?: string;
    message: string;
}
export declare function sendGmailRealWithDraft(draft: MailDraft, opts: {
    mode?: GmailSendMode;
    confirmed?: boolean;
    projectId?: string;
}): Promise<GmailRealSendResult>;
/** Phase 2251–2300 — イベント通知用 Gmail 簡易送信 */
export declare function sendGmailNotification(input: {
    to: string;
    subject: string;
    body: string;
    confirmed?: boolean;
}): Promise<{
    ok: boolean;
    error?: string;
}>;

export type GmailNotificationMode = "mock" | "real";
export declare function getGmailNotificationMode(env?: NodeJS.ProcessEnv): GmailNotificationMode;
export declare function isSmtpGmailConfigured(env?: NodeJS.ProcessEnv): boolean;
export declare function maskSmtpCredentials(env?: NodeJS.ProcessEnv): string;
export declare function getGmailSmtpStatus(env?: NodeJS.ProcessEnv): {
    gmailMode: GmailNotificationMode;
    smtpConfigured: boolean;
    statusLabel: string;
    infraStatus: "GREEN" | "YELLOW" | "RED";
    maskedCredentials: string;
};
export declare function logGmailStartupStatus(): void;
/** Phase 2385 — テスト送信用ミニマル PDF */
export declare function buildGmailTestAttachmentPdf(): Buffer;
export declare const GMAIL_TEST_ATTACHMENT_FILENAME = "tisly-gmail-test.pdf";
export declare function sendSmtpGmailMail(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: Array<{
        filename: string;
        content: Buffer;
        contentType?: string;
    }>;
    sendType?: string;
    skipLog?: boolean;
}): Promise<{
    ok: boolean;
    error?: string;
    messageId?: string;
    logId?: string;
    mock?: boolean;
}>;
export declare function sendGmailTestEmail(to: string): Promise<{
    ok: boolean;
    error?: string;
    logId?: string;
    mock?: boolean;
    gmailMode: GmailNotificationMode;
    smtpConfigured: boolean;
    maskedCredentials: string;
    attachmentFileName: string;
    attachmentIncluded: boolean;
}>;

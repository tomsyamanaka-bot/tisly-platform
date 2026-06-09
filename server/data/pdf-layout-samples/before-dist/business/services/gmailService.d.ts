import type { BusinessProject, CompletionReport, Estimate, Invoice, MailDraft } from "../business-types.js";
/** 将来 Gmail API に差し替えるための契約 */
export interface GmailProvider {
    sendDraft(draft: MailDraft): Promise<{
        messageId?: string;
        status: "draft" | "sent";
    }>;
}
export declare class MockGmailProvider implements GmailProvider {
    sendDraft(draft: MailDraft): Promise<{
        messageId: string;
        status: "draft";
    }>;
}
export declare function setGmailProvider(provider: GmailProvider): void;
export declare function getGmailProvider(): GmailProvider;
export declare function createEstimateMailDraft(project: BusinessProject, estimate: Estimate): MailDraft;
export declare function createCompletionMailDraft(project: BusinessProject, completionReport: CompletionReport): MailDraft;
export declare function createInvoiceMailDraft(project: BusinessProject, invoice: Invoice): MailDraft;
/** @deprecated Phase521 互換 */
export declare function createInvoiceAndReportMailDraft(project: BusinessProject, invoice: Invoice, completionReport: CompletionReport): MailDraft;
export declare function sendMailDraft(draft: MailDraft): Promise<MailDraft>;

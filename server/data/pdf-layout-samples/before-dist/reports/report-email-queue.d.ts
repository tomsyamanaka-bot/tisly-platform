export interface ReportEmailJob {
    id: string;
    customer_id: string;
    export_id: string | null;
    to_address: string;
    subject: string;
    body_html: string;
    attachment_name: string | null;
    attachment_format: string;
    status: string;
    attempts: number;
    max_attempts: number;
    next_retry_at: string | null;
    last_error: string | null;
    created_at: string;
    updated_at: string;
    sent_at: string | null;
}
export declare function enqueueReportEmail(input: {
    customerId: string;
    exportId?: string;
    to: string;
    subject: string;
    html: string;
    attachmentName?: string;
    attachmentFormat?: "pdf" | "html";
    attachmentBuffer?: Buffer;
}): ReportEmailJob;
export declare function getReportEmailJob(id: string): ReportEmailJob | null;
export declare function listPendingReportEmails(limit?: number): ReportEmailJob[];
export declare function processReportEmailJob(job: ReportEmailJob): Promise<ReportEmailJob>;
export declare function countPendingReportEmails(): number;

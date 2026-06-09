export interface CompletionReportMeta {
    exportId: string;
    customerCode: string;
    customerName: string;
    siteName: string | null;
    actor: string | null;
    generatedAt: string;
    dryRun: boolean;
    photoCount: number;
}
export declare function buildCompletionReportMeta(customerCode: string, actor?: string, opts?: {
    dryRun?: boolean;
    siteName?: string | null;
}): CompletionReportMeta;
export type CompletionReportLocale = "ja" | "en";
export declare function buildInstallCompletionReportHtml(customerCode: string, actor?: string, opts?: {
    dryRun?: boolean;
    siteName?: string | null;
    locale?: CompletionReportLocale;
}): string;
export declare function buildInstallCompletionReportPdf(html: string): Promise<Buffer | null>;

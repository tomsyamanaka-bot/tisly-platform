import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
import type { TomsEstimateHeader } from "../toms-document-format.js";
export declare function generateEstimatePdf(project: BusinessProject, estimate: Estimate, ctx?: EstimatePdfRenderContext): string;
export interface InvoicePdfRenderContext {
    estimateRefNo?: string;
    notes?: string | null;
    includePhotos?: boolean;
}
export declare function generateInvoicePdf(project: BusinessProject, invoice: Invoice, estimate: Estimate, ctx?: InvoicePdfRenderContext): string;
export declare function generateCompletionReportPdf(project: BusinessProject, report: CompletionReport): string;
export interface EstimatePdfRenderContext {
    siteName?: string | null;
    workLocation?: string | null;
    customerAddress?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    staffName?: string | null;
    notes?: string | null;
    header?: TomsEstimateHeader | null;
    includePhotos?: boolean;
}
export declare function getEstimatePdfOrPlaceholder(project: BusinessProject, estimate: Estimate, ctx?: EstimatePdfRenderContext): {
    contentType: string;
    path: string;
};
export declare function getInvoicePdfOrPlaceholder(project: BusinessProject, invoice: Invoice, estimate: Estimate, ctx?: InvoicePdfRenderContext): {
    contentType: string;
    path: string;
};
export declare function getCompletionReportPdfOrPlaceholder(project: BusinessProject, report: CompletionReport): {
    contentType: string;
    path: string;
};

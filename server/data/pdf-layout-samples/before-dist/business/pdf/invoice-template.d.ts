import type { BusinessProject, Estimate, Invoice } from "../business-types.js";
import { type TomsInvoiceHeader } from "../toms-document-format.js";
export interface InvoiceHtmlOptions {
    header?: TomsInvoiceHeader | null;
    estimateRefNo?: string;
    notes?: string | null;
    includePhotos?: boolean;
}
export declare function buildInvoiceHeader(project: BusinessProject, invoice: Invoice, estimate: Estimate, opts?: InvoiceHtmlOptions): TomsInvoiceHeader;
export declare function renderInvoiceHtml(project: BusinessProject, invoice: Invoice, estimate: Estimate, opts?: InvoiceHtmlOptions): string;

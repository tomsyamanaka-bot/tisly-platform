import type { BusinessPhoto } from "../business-types.js";
import type { TomsEstimateHeader, TomsInvoiceHeader } from "../toms-document-format.js";
export declare function escapeHtml(s: string): string;
export declare function escapeHtmlMultiline(s: string): string;
export declare function renderPdfHeader(docTitle: string, docNo: string): string;
export interface TomsDocHeaderInput {
    docTitle: string;
    addressee: string;
    subject: string;
    issueDateLabel: string;
    issueDate: string;
    docNoLabel: string;
    docNo: string;
    /** 見積書は false、請求書は true（デフォルト） */
    includeRegistrationNo?: boolean;
    workLocation?: string;
}
export declare function renderTomsDocLayoutHeader(input: TomsDocHeaderInput): string;
export declare function renderAmountBanner(total: number): string;
export declare function renderTomsEstimateStandardHeader(header: TomsEstimateHeader): string;
export declare function renderTomsCompanyFooter(): string;
export declare function renderCustomerBlock(customerName: string, title: string, address: string, projectNo: string): string;
export interface TomsCustomerSiteBlockInput {
    customerName: string;
    customerAddress?: string | null;
    siteName?: string | null;
    siteAddress?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    projectNo: string;
    estimateDate?: string | null;
}
export declare function renderTomsCustomerSiteBlock(input: TomsCustomerSiteBlockInput): string;
export declare function renderTomsEstimateHeaderTable(header: TomsEstimateHeader): string;
export declare function renderTomsInvoiceHeaderTable(header: TomsInvoiceHeader): string;
export declare function renderTomsLineItemsTable(items: Array<{
    lineNo?: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
}>): string;
export declare function renderLineItemsTable(items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
    taxType?: string;
    memo?: string;
}>): string;
export declare function renderTotals(subtotal: number, tax: number, total: number): string;
export declare function renderNotes(notes: string): string;
export declare function renderPhotoGrid(photos: BusinessPhoto[], includeImages?: boolean): string;
export declare function renderBankBlock(bankInfo: string): string;
export declare function renderBankQrPlaceholder(bankInfo?: string): string;
export declare function renderSealPlaceholder(): string;

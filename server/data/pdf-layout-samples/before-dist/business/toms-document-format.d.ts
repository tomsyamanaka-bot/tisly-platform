/** TOMS 標準見積・請求書フォーマット（Excel連携準備含む） */
import type { BusinessProject, Estimate, EstimateLineItem } from "./business-types.js";
import { getTomsCompanyInfo } from "./pdf/company.js";
export interface TomsEstimateHeader {
    addressee: string;
    subject: string;
    issueDate: string;
    estimateNo: string;
    staffName: string;
    /** @deprecated 後方互換のみ。UI・PDFでは工事場所を使用 */
    siteName?: string;
    workLocation: string;
    address?: string;
    phone?: string;
    email?: string;
}
export interface TomsInvoiceHeader {
    addressee: string;
    subject: string;
    invoiceDate: string;
    invoiceNo: string;
    staffName: string;
    /** @deprecated 後方互換のみ */
    siteName?: string;
    workLocation: string;
    address?: string;
    phone?: string;
    email?: string;
    estimateRefNo: string;
    bankInfo: string;
}
export interface TomsEstimateLine {
    lineNo: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
}
export interface TomsEstimateDocumentV1 {
    version: "toms-standard-v1";
    excelTemplate: "TOMS_見積もり書_フォーマット.xlsx";
    company: ReturnType<typeof getTomsCompanyInfo>;
    header: TomsEstimateHeader;
    lines: TomsEstimateLine[];
    subtotal: number;
    tax: number;
    total: number;
    notes: string;
    photosIncluded: boolean;
    generatedAt: string;
}
export interface TomsInvoiceDocumentV1 {
    version: "toms-standard-v1";
    excelTemplate: "TOMS_請求書_フォーマット.xlsx";
    company: ReturnType<typeof getTomsCompanyInfo>;
    header: TomsInvoiceHeader;
    lines: TomsEstimateLine[];
    subtotal: number;
    tax: number;
    total: number;
    generatedAt: string;
}
export declare const TOMS_DEFAULT_STAFF = "\u5C71\u4E2D \u667A\u7D00";
export declare const TOMS_DEFAULT_BANK_INFO: any;
/** 発行日 YYYY/MM/DD */
export declare function formatTomsIssueDate(d?: Date): string;
/** 見積・請求番号プレフィックス YYMMDD */
export declare function formatTomsDocDatePrefix(d?: Date): string;
/** 当日連番 YYMMDD-001 */
export declare function generateTomsDailyDocNo(table: "business_estimates" | "business_invoices", column: "estimate_no" | "invoice_no", d?: Date): string;
export declare function lineDescription(item: EstimateLineItem): string;
export declare function isEmptyLineItem(item: EstimateLineItem): boolean;
export declare function itemsToTomsLines(items: EstimateLineItem[]): TomsEstimateLine[];
/** 宛名に御中を付与（様・御中が無い場合） */
export declare function formatTomsAddressee(name: string): string;
export declare function buildDefaultEstimateHeader(estimate: Estimate, ctx?: {
    siteName?: string | null;
    workLocation?: string | null;
    staffName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
}): TomsEstimateHeader;
export declare function parseEstimateHeaderJson(raw: string | null | undefined): TomsEstimateHeader | null;
export declare function mergeEstimateHeader(estimate: Estimate, stored: TomsEstimateHeader | null, ctx?: {
    siteName?: string | null;
    workLocation?: string | null;
    staffName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
}): TomsEstimateHeader;
export declare function buildTomsEstimateDocument(project: BusinessProject, estimate: Estimate, header: TomsEstimateHeader, opts?: {
    notes?: string;
    photosIncluded?: boolean;
}): TomsEstimateDocumentV1;
export declare function buildTomsInvoiceDocument(estimate: Estimate, header: TomsInvoiceHeader): TomsInvoiceDocumentV1;

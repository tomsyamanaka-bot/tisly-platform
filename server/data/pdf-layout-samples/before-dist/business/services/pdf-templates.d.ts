import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
export type PdfDocumentKind = "estimate" | "invoice" | "completion_report";
export interface PdfTemplateMeta {
    id: PdfDocumentKind;
    version: string;
    provider: "placeholder" | "toms_standard";
    description: string;
}
export declare function getPdfTemplateMeta(kind: PdfDocumentKind): PdfTemplateMeta;
export declare function renderPdfPlaceholderHtml(kind: PdfDocumentKind, project: BusinessProject, doc: Estimate | Invoice | CompletionReport): string;

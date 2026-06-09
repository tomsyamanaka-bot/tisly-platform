import type { BusinessProject, CompletionReport, Estimate, Invoice } from "../business-types.js";
export type PdfDocumentKind = "estimate" | "invoice" | "completion_report" | "specification";
export type PdfRenderMode = "html" | "puppeteer";
export declare function getPdfRenderMode(): PdfRenderMode;
export declare function htmlToPdfBuffer(html: string): Promise<Buffer | null>;
/** Puppeteer 失敗時は HTML のみ保存して minimal PDF にフォールバック */
export declare function renderWithPdfFallback(html: string, title: string): Promise<{
    pdfBuf: Buffer;
    usedFallback: boolean;
    renderMode: PdfRenderMode;
}>;
export interface RenderedBusinessPdf {
    htmlPath: string;
    pdfPath: string | null;
    contentType: "application/pdf" | "text/html; charset=utf-8";
    localPath: string;
}
export declare function renderBusinessPdf(kind: PdfDocumentKind, project: BusinessProject, doc: Estimate | Invoice | CompletionReport): Promise<RenderedBusinessPdf>;
export declare function renderSpecificationHtml(project: BusinessProject, specNo: string, title: string): string;
export declare function renderSpecificationPdf(project: BusinessProject, specNo: string, title: string): Promise<RenderedBusinessPdf>;
export interface UnifiedPdfPipelineResult extends RenderedBusinessPdf {
    kind: PdfDocumentKind | "specification";
    renderMode: PdfRenderMode;
    previewUrl: string;
}
export declare function runUnifiedPdfPipeline(kind: PdfDocumentKind, project: BusinessProject, doc: Estimate | Invoice | CompletionReport): Promise<UnifiedPdfPipelineResult>;
export declare function getRenderedHtmlPath(projectId: string, kind: PdfDocumentKind): string | null;

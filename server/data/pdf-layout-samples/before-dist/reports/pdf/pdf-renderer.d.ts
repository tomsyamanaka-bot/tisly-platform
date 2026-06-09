import type { PdfRenderOptions } from "./pdf-options.js";
export interface PdfRenderResult {
    format: "pdf" | "html";
    buffer: Buffer;
    engine: "puppeteer" | "html-placeholder";
    export_id?: string;
    pdfTodo?: string;
    qnapArchive?: {
        mode: string;
        path?: string;
        todo?: string;
    };
}
export interface PdfRenderContext {
    exportId?: string;
    customerId?: string;
    reportType?: string;
}
export declare function renderReportPdf(html: string, title: string, options?: PdfRenderOptions, context?: PdfRenderContext): Promise<PdfRenderResult>;

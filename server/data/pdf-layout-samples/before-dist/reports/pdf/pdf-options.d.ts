export interface PdfRenderOptions {
    format?: "A4" | "Letter";
    printBackground?: boolean;
    margin?: {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
    };
    preferPuppeteer?: boolean;
}
export declare function isPdfPuppeteerEnabled(): boolean;
export declare const DEFAULT_PDF_OPTIONS: PdfRenderOptions;

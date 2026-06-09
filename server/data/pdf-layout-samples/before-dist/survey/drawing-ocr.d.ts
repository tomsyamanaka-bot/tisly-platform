/** Placeholder OCR — swap implementation for OpenAI Vision / dedicated OCR later. */
export interface DrawingOcrResult {
    drawingId: string;
    placeholder: true;
    provider: "rule-based-v1";
    floors: string[];
    rooms: string[];
    symbols: string[];
    meta: {
        fileName: string | null;
        mimeType: string | null;
        processedAt: string;
    };
}
export declare function runDrawingOcr(drawingId: string): DrawingOcrResult;

import { type DemoEstimateType } from "./demo-pdf-estimate.js";
export interface SalesPdfArchiveEntry {
    type: DemoEstimateType;
    title: string;
    htmlUrl: string;
    pdfUrl: string | null;
    qnapMockPath: string | null;
    renderMode: string;
}
export declare function buildSalesPdfArchive(): Promise<{
    renderMode: string;
    qnapMockRoot: string;
    entries: SalesPdfArchiveEntry[];
}>;

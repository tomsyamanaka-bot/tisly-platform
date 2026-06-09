import type { BusinessProject } from "../business-types.js";
import type { DrawingPlan, SpecificationDocument } from "../drawing-types.js";
export declare function buildSpecificationPdfLines(project: BusinessProject, plan: DrawingPlan, doc: Pick<SpecificationDocument, "title" | "overview" | "workSummary" | "notes">): string[];
export declare function generateSpecificationPdf(project: BusinessProject, plan: DrawingPlan, doc: Pick<SpecificationDocument, "title" | "overview" | "workSummary" | "notes">): {
    pdfPath: string;
    qnapPath: string;
};
export declare function createSpecificationDocumentFromPlan(project: BusinessProject, plan: DrawingPlan, input?: {
    title?: string;
    overview?: string;
    workSummary?: string;
    notes?: string;
}): SpecificationDocument;

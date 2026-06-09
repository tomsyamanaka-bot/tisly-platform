import type { DrawingPlan, DrawingSourceType, DrawingSymbol, DrawingTradeType, SpecificationDocument } from "./drawing-types.js";
export declare function seedDrawingSymbolsIfEmpty(): number;
export declare function listDrawingSymbols(tradeType?: DrawingTradeType): DrawingSymbol[];
export declare function createDrawingPlan(input: {
    projectId: string;
    title?: string;
    sourceType?: DrawingSourceType;
    tradeType?: DrawingTradeType;
}): DrawingPlan;
export declare function getDrawingPlan(id: string): DrawingPlan | null;
export declare function listDrawingPlans(projectId: string): DrawingPlan[];
export declare function updateDrawingPlan(id: string, patch: Partial<Pick<DrawingPlan, "title" | "sourceType" | "backgroundImagePath" | "cleanImagePath" | "tradeType" | "symbols" | "routes" | "notes">>): DrawingPlan;
export declare function countDrawingPlansInProgress(): number;
export declare function countProjectsWithoutSpecification(): number;
export declare function countDrawingEstimateNotApplied(): number;
export declare function saveSpecificationDocument(doc: SpecificationDocument): void;
export declare function getSpecificationDocument(projectId: string, id?: string): SpecificationDocument | null;
export declare function listSpecificationDocuments(projectId: string): SpecificationDocument[];

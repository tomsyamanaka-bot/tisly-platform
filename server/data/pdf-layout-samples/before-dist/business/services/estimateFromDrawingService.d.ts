import type { DrawingEstimateCandidate, DrawingEstimateCandidateLine, DrawingPlan } from "../drawing-types.js";
export declare function summarizeMaterialsFromDrawing(plan: DrawingPlan): DrawingEstimateCandidateLine[];
export declare function summarizeRoutesFromDrawing(plan: DrawingPlan): DrawingEstimateCandidateLine[];
export declare function createEstimateCandidateFromDrawingPlan(plan: DrawingPlan): DrawingEstimateCandidate;

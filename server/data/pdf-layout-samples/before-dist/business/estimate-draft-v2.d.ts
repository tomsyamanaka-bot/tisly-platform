export interface EstimateDraftLineV2 {
    id: string;
    materialCategory: string;
    laborCategory: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    costPrice: number;
    grossProfitRate: number;
    memo: string;
    customerDescription: string;
}
export interface EstimateDraftV2 {
    id: string;
    projectId: string;
    version: string;
    lines: EstimateDraftLineV2[];
    subtotal: number;
    totalCost: number;
    grossProfit: number;
    grossProfitRate: number;
    status: "draft" | "finalized";
    createdAt: string;
    updatedAt: string;
}
export declare function createEstimateDraftV2(projectId: string, opts?: {
    runAnalysis?: boolean;
}): EstimateDraftV2;
export declare function getEstimateDraftV2(id: string): EstimateDraftV2 | null;
export declare function getLatestEstimateDraftV2(projectId: string): EstimateDraftV2 | null;
export declare function patchEstimateDraftV2(id: string, patch: {
    lines?: EstimateDraftLineV2[];
    status?: EstimateDraftV2["status"];
}): EstimateDraftV2 | null;

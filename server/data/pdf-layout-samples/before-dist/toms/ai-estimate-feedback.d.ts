export type AiFeedbackAction = "adopted" | "revised" | "rejected";
export interface AiEstimateFeedbackRecord {
    id: string;
    projectId: string;
    estimateV3Id: string | null;
    action: AiFeedbackAction;
    notes: string;
    candidate: Record<string, unknown>;
    createdAt: string;
}
export declare function saveAiEstimateFeedback(input: {
    projectId: string;
    estimateV3Id?: string;
    action: AiFeedbackAction;
    notes?: string;
    candidate?: Record<string, unknown>;
}): AiEstimateFeedbackRecord;
export declare function listAiEstimateFeedback(projectId: string): AiEstimateFeedbackRecord[];

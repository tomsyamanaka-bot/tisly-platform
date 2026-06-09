export interface AiFeedbackLearningStats {
    total: number;
    adopted: number;
    revised: number;
    rejected: number;
    adoptionRate: number;
    revisionRate: number;
    rejectionRate: number;
    topRevisedFields: Array<{
        field: string;
        count: number;
    }>;
}
export interface AiLearningCandidateHints {
    preferLineItems: string[];
    avoidLineItems: string[];
    revisionNotes: string[];
    confidenceBoost: number;
}
export declare function aggregateAiFeedbackLearning(projectId?: string): AiFeedbackLearningStats;
export declare function buildAiLearningCandidateHints(projectId?: string): AiLearningCandidateHints;
export declare function applyLearningToAiEstimateCandidate(base: Record<string, unknown>, projectId?: string): Record<string, unknown>;

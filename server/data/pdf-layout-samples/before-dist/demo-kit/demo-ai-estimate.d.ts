export interface DemoAiEstimateStep {
    step: string;
    status: "done" | "pending";
    detail?: string;
}
export declare function getDemoSurveyProjectId(customerCode: string): string | null;
export declare function runDemoAiEstimateFlow(customerCode?: string): {
    customerCode: string;
    surveyProjectId: string;
    photoIds: string[];
    aiCandidate: Record<string, unknown>;
    businessProjectId: string;
    estimateId: string | null;
    steps: DemoAiEstimateStep[];
};

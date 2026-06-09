export interface AiFeedbackWeeklySegment {
    customerId: string | null;
    industry: string | null;
    adopted: number;
    revised: number;
    rejected: number;
    total: number;
    topRevisedFields: Array<{
        field: string;
        count: number;
    }>;
    commonRevisionNotes: string[];
}
export interface AiFeedbackWeeklySummary {
    weekStart: string;
    weekEnd: string;
    generatedAt: string;
    mockAi: boolean;
    totals: {
        adopted: number;
        revised: number;
        rejected: number;
        total: number;
    };
    byCustomer: AiFeedbackWeeklySegment[];
    byIndustry: AiFeedbackWeeklySegment[];
    topRevisedFieldsGlobal: Array<{
        field: string;
        count: number;
    }>;
}
export declare function runAiFeedbackWeeklyBatch(refDate?: Date): AiFeedbackWeeklySummary;

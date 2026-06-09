export interface AiIntakeInput {
    notes?: string;
    gps?: {
        lat?: number;
        lng?: number;
    };
}
export interface AiIntakeResult {
    placeholder: true;
    provider: "rule-based-v1";
    rooms: Array<{
        name: string;
        floor: string;
    }>;
    exterior_points: Array<{
        label: string;
        posHint: string;
    }>;
    entry_points: Array<{
        label: string;
    }>;
    windows: number;
    doors: number;
    stairs: number;
    electrical_panel: {
        count: number;
        notes: string;
    };
    network_point: {
        count: number;
        notes: string;
    };
    risk_points: string[];
    recommended_devices: Array<{
        type: string;
        qty: number;
        reason: string;
    }>;
}
export declare function runSurveyAiIntake(projectId: string, input?: AiIntakeInput): AiIntakeResult;
export declare function getLatestAiIntake(projectId: string): AiIntakeResult | null;

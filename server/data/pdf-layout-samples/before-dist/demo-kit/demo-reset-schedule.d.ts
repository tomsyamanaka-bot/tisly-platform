export type DemoResetScheduleMode = "manual" | "morning" | "before_sales";
export interface DemoResetScheduleConfig {
    mode: DemoResetScheduleMode;
    enabled: boolean;
    nextRunAt: string | null;
    lastRunAt: string | null;
    description: string;
    cronExpr: string;
    envEnabled: boolean;
    cronActive: boolean;
}
export declare function getDemoResetSchedule(): DemoResetScheduleConfig & {
    cronLabel: string;
};
export declare function setDemoResetSchedule(input: {
    mode?: DemoResetScheduleMode;
    enabled?: boolean;
}): DemoResetScheduleConfig & {
    cronLabel: string;
};
export declare function markDemoResetScheduleRan(): void;
export declare function listDemoResetScheduleModes(): DemoResetScheduleMode[];

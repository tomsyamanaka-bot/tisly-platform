export type ScheduleMode = "armed" | "disarmed" | "business" | "night";
export interface CustomerSchedule {
    id: string;
    customer_id: string;
    site_id: string | null;
    name: string;
    mode: ScheduleMode;
    cron_expr: string | null;
    time_start: string | null;
    time_end: string | null;
    days_of_week_json: string;
    enabled: number;
    created_at: string;
    updated_at: string;
}
export declare function listSchedules(customerId: string): CustomerSchedule[];
export declare function createSchedule(input: {
    customerId: string;
    siteId?: string | null;
    name: string;
    mode: ScheduleMode;
    cronExpr?: string | null;
    timeStart?: string | null;
    timeEnd?: string | null;
    daysOfWeek?: number[];
    enabled?: boolean;
}): CustomerSchedule;
export declare function getSchedule(customerId: string, id: string): CustomerSchedule | null;
export declare function updateSchedule(customerId: string, id: string, patch: Partial<{
    name: string;
    mode: ScheduleMode;
    siteId: string | null;
    cronExpr: string | null;
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: number[];
    enabled: boolean;
}>): CustomerSchedule | null;
export declare function deleteSchedule(customerId: string, id: string): boolean;
/** Resolve active schedule mode for a customer at a given time (simplified). */
export declare function resolveActiveMode(customerId: string, at?: Date): ScheduleMode | null;

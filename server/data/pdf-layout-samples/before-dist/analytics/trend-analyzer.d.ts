export interface TrendPoint {
    label: string;
    count: number;
}
export interface TrendReport {
    period: "today" | "week" | "month";
    totalEvents: number;
    anomalyCount: number;
    byHour: TrendPoint[];
    byType: TrendPoint[];
    bySite: TrendPoint[];
    peakHour: string | null;
    topEventType: string | null;
}
export declare function analyzeTrends(period?: "today" | "week" | "month"): TrendReport;

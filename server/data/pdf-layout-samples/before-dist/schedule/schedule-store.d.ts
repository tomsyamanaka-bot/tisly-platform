import type { DayAvailability, ScheduleMonthView, ScheduleThreeWeekBlock, ScheduleWeekSummary, ScheduleWeekView, UnavailableDay } from "./schedule-types.js";
import type { ScheduleDayDetail } from "./schedule-types.js";
export declare function calcAvailability(eventCount: number, unavailable: boolean): DayAvailability;
export declare function listUnavailableDays(startDate: string, endDate: string): UnavailableDay[];
export declare function getScheduleWeekView(offsetRaw?: unknown): Promise<ScheduleWeekView>;
export declare function getScheduleThreeWeekView(offsetRaw?: unknown): Promise<{
    offset: number;
    blocks: ScheduleThreeWeekBlock[];
}>;
export declare function getScheduleDayDetail(dateRaw: unknown, opts?: {
    location?: string;
}): Promise<ScheduleDayDetail | null>;
export declare function getScheduleMonthView(yearRaw: unknown, monthRaw: unknown): Promise<ScheduleMonthView>;
export declare function getScheduleSummary(range: string, offsetRaw?: unknown): Promise<ScheduleWeekSummary>;
export declare function createUnavailableDay(input: {
    date: string;
    reason: string;
}): UnavailableDay;
export declare function updateUnavailableDay(id: string, patch: {
    reason?: string;
}): UnavailableDay | null;
export declare function deleteUnavailableDay(id: string): boolean;

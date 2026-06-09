/** Google Calendar 同期イベントのローカルキャッシュ */
import type { ScheduleEvent } from "./schedule-types.js";
export interface CalendarSyncMeta {
    lastSyncedAt: string | null;
    eventCount: number;
    rangeStart: string | null;
    rangeEnd: string | null;
}
export declare function listCachedCalendarEvents(startDate: string, endDate: string): ScheduleEvent[];
export declare function hasCachedCalendarEvents(): boolean;
export declare function replaceCachedCalendarEvents(startDate: string, endDate: string, events: ScheduleEvent[]): number;
export declare function getCalendarSyncMeta(): CalendarSyncMeta;

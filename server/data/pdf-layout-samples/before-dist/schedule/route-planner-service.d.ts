/** 配車表 — 案件データから自動生成（将来 Directions API 接続可能構成） */
import type { ScheduleEvent } from "./schedule-types.js";
export interface RouteStop {
    time: string;
    title: string;
    address?: string;
    mapsQuery?: string;
    projectId?: string;
    assignee?: string;
    navUrl?: string;
}
export interface RouteLeg {
    fromTitle: string;
    toTitle: string;
    durationMin: number;
    mode: "car";
    mapsUrl: string;
    memo?: string;
}
export interface DayDispatch {
    date: string;
    driver: string;
    vehicle: string;
    stops: RouteStop[];
    legs: RouteLeg[];
}
export declare function mapsDirectionsUrl(origin: string, destination: string): string;
export declare function mapsNavUrl(destination: string): string;
/** 案件優先、なければカレンダー工事予定から配車表を構築 */
export declare function buildDayDispatch(date: string, events: ScheduleEvent[]): DayDispatch | null;
export interface SiteTravelHint {
    date: string;
    siteTitle: string;
    prevDurationMin: number | null;
    nextDurationMin: number | null;
    prevFrom: string | null;
    nextTo: string | null;
}
export declare function travelHintsForSite(date: string, siteTitle: string, dispatch: DayDispatch | null): SiteTravelHint;

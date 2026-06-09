/**
 * Google Calendar 連携 — OAuth 対応（mock / real 切替）
 * 取得: 予定名・開始/終了日時・終日・場所・説明 + カテゴリ自動判定
 */
import type { ScheduleCategory, ScheduleEvent } from "../schedule/schedule-types.js";
export interface GoogleCalendarConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    calendarId: string;
}
export declare const GOOGLE_CALENDAR_CONFIG_PLACEHOLDER: GoogleCalendarConfig;
export interface CalendarProvider {
    listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]>;
    mode: "mock" | "real";
}
/** 予定名・説明・場所からカテゴリを自動判定 */
export declare function classifyEventCategory(title: string, description?: string | null, location?: string | null): ScheduleCategory;
/** デモ用モック予定 */
export declare function mockCalendarEvents(startDate: string, endDate: string): ScheduleEvent[];
export declare class MockGoogleCalendarProvider implements CalendarProvider {
    mode: "mock" | "real";
    listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]>;
}
export declare class RealGoogleCalendarProvider implements CalendarProvider {
    mode: "mock" | "real";
    private calendarId;
    constructor(calendarId?: string);
    listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]>;
}
export declare function setCalendarProvider(p: CalendarProvider): void;
export declare function resetCalendarProvider(): void;
export declare function getCalendarProvider(): CalendarProvider;
export declare function fetchCalendarEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]>;
export declare function syncGoogleCalendarEvents(startDate: string, endDate: string): Promise<{
    events: ScheduleEvent[];
    mode: "mock" | "real";
    count: number;
}>;
export declare function getCalendarOAuthStatus(): {
    enabled: boolean;
    mode: import("./googleOAuthService.js").GoogleOAuthMode;
    connected: boolean;
    calendar: {
        provider: import("./googleOAuthService.js").GoogleOAuthMode;
        ready: boolean;
    };
    gmail: {
        provider: import("./googleOAuthService.js").GoogleOAuthMode;
        ready: boolean;
    };
    clientIdConfigured: boolean;
    redirectUri: string | null;
};
export declare function getCalendarAuthUrl(): {
    url: string;
    mode: import("./googleOAuthService.js").GoogleOAuthMode;
};
export declare function handleCalendarOAuthCallback(input: {
    code?: string;
    error?: string;
}): Promise<{
    ok: boolean;
    mode: import("./googleOAuthService.js").GoogleOAuthMode;
    message: string;
    refreshTokenSaved?: boolean;
}>;
export declare function getWeekStartWithOffset(offsetWeeks?: number): string;

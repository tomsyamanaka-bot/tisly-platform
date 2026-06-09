import type { BusinessProject, CalendarDraft } from "../business-types.js";
/** 将来 Google Calendar API に差し替えるための契約 */
export interface GoogleCalendarProvider {
    createEvent(draft: CalendarDraft): Promise<{
        externalId?: string;
        status: "draft" | "synced";
    }>;
}
export declare class MockGoogleCalendarProvider implements GoogleCalendarProvider {
    createEvent(draft: CalendarDraft): Promise<{
        externalId: string;
        status: "draft";
    }>;
}
export declare function setGoogleCalendarProvider(provider: GoogleCalendarProvider): void;
export declare function getGoogleCalendarProvider(): GoogleCalendarProvider;
export declare function createSiteSurveyCalendarDraft(project: BusinessProject): CalendarDraft;
export declare function createSurveyCalendarDraft(project: BusinessProject): CalendarDraft;
export declare function createConstructionCalendarDraft(project: BusinessProject): CalendarDraft;
export declare function createPaymentCalendarDraft(project: BusinessProject): CalendarDraft;
export declare function syncCalendarDraftToGoogle(draft: CalendarDraft): Promise<CalendarDraft>;

/** AI Analytics — event classification for risk scoring */
export type EventCategory = "intrusion" | "perimeter" | "access" | "environment" | "safety" | "connectivity" | "recovery" | "camera" | "other";
export interface ClassifiedEvent {
    eventType: string;
    category: EventCategory;
    isNightTime: boolean;
    isConcurrent: boolean;
    baseRisk: number;
}
export declare function classifyEventCategory(eventType: string): EventCategory;
export declare function isNightHour(date?: Date): boolean;
export declare function classifyEvent(eventType: string, createdAt?: string, concurrentCount?: number): ClassifiedEvent;

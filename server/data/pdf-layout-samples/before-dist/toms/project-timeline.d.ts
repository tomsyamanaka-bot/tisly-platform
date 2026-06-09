import type { TimelineEventType } from "./toms-types.js";
export interface ProjectTimelineEntry {
    id: string;
    projectId: string;
    eventType: TimelineEventType | string;
    title: string;
    detail: string;
    actor: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}
export declare function timelineTitleFor(eventType: string): string;
export declare function appendProjectTimeline(input: {
    projectId: string;
    eventType: TimelineEventType | string;
    title?: string;
    detail?: string;
    actor?: string;
    metadata?: Record<string, unknown>;
}): ProjectTimelineEntry;
export declare function listProjectTimeline(projectId: string, limit?: number): ProjectTimelineEntry[];
export declare function seedTimelineFromProject(projectId: string, createdAt: string): void;

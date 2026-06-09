export type TimelineCategory = "Survey" | "Estimate" | "Construction" | "Device" | "Alert" | "Maintenance";
export interface TislyTimelineEvent {
    id: string;
    category: TimelineCategory;
    title: string;
    detail: string;
    projectId: string | null;
    customerCode: string | null;
    createdAt: string;
    metadata: Record<string, unknown>;
}
export declare function buildUnifiedTimeline(filters?: {
    projectId?: string;
    customerCode?: string;
    limit?: number;
}): TislyTimelineEvent[];

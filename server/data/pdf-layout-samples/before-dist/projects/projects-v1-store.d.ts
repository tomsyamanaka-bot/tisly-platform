/** 案件一覧 PWA v1 — business + survey 統合表示 */
export type ProjectPipelineStage = "survey" | "estimate" | "construction" | "invoice" | "payment" | "done";
export interface ProjectListItemV1 {
    id: string;
    projectNo: string;
    title: string;
    customerName: string;
    address: string;
    status: string;
    statusLabel: string;
    pipeline: Record<ProjectPipelineStage, "pending" | "active" | "done">;
    source: "business" | "survey";
    updatedAt: string;
}
export interface ProjectTimelineItemV1 {
    date: string;
    label: string;
    detail: string;
}
export interface ProjectDetailV1 {
    project: ProjectListItemV1;
    timeline: ProjectTimelineItemV1[];
    phone: string | null;
    assignee: string | null;
}
export declare function listProjectsV1(opts?: {
    customerCode?: string;
    limit?: number;
}): ProjectListItemV1[];
export declare function getProjectDetailV1(id: string, source?: string): ProjectDetailV1 | null;

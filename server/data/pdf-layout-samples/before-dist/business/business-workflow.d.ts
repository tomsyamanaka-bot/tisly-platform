import type { BusinessProject, BusinessProjectStatus } from "./business-types.js";
export interface StatusTransitionResult {
    project: BusinessProject;
    calendarDraft?: unknown;
    mailDraft?: unknown;
    qnapSave?: unknown;
}
export declare function transitionProjectStatus(projectId: string, to: BusinessProjectStatus | string): StatusTransitionResult;
export declare function closeProject(projectId: string): BusinessProject;

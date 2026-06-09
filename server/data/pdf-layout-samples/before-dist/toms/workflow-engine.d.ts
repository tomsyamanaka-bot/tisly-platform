import type { BusinessProjectStatus } from "../business/business-types.js";
import { type TomsWorkflowState } from "./toms-types.js";
export interface WorkflowHistoryEntry {
    id: string;
    projectId: string;
    fromState: TomsWorkflowState;
    toState: TomsWorkflowState;
    note: string;
    actor: string;
    createdAt: string;
}
export declare function businessStatusToToms(status: string): TomsWorkflowState;
export declare function getTomsWorkflowState(projectId: string): TomsWorkflowState | null;
export declare function listWorkflowHistory(projectId: string, limit?: number): WorkflowHistoryEntry[];
export declare function transitionTomsWorkflow(projectId: string, to: TomsWorkflowState, opts?: {
    actor?: string;
    note?: string;
}): {
    state: TomsWorkflowState;
    projectStatus: BusinessProjectStatus;
};
export declare function recordWorkflowFromBusinessStatus(projectId: string, fromStatus: string, toStatus: string, actor?: string): void;

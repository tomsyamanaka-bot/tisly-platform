export interface ProjectMaintenanceCase {
    caseId: string;
    projectId: string;
    scheduledDate: string;
    content: string;
    targetDevices: string[];
    photos: string[];
    assignee: string;
    status: "open" | "in_progress" | "closed";
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare function listMaintenanceDueSoon(daysAhead?: number): Array<ProjectMaintenanceCase & {
    daysUntil: number;
    overdue: boolean;
}>;
export declare function listProjectMaintenance(projectId: string): ProjectMaintenanceCase[];
export declare function createProjectMaintenance(input: {
    projectId: string;
    scheduledDate: string;
    content?: string;
    targetDevices?: string[];
    photos?: string[];
    assignee?: string;
}): ProjectMaintenanceCase;
export declare function closeProjectMaintenance(projectId: string, caseId: string, actor?: string): ProjectMaintenanceCase | null;

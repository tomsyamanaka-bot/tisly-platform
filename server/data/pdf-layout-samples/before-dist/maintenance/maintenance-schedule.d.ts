export interface MaintenanceSchedule {
    scheduleId: string;
    customerCode: string;
    siteId: string | null;
    title: string;
    dueDate: string;
    status: string;
    createdAt: string;
}
export interface MaintenanceReport {
    reportId: string;
    scheduleId: string | null;
    caseId: string | null;
    customerCode: string;
    comment: string | null;
    photos: string[];
    completedAt: string;
    reportedBy: string | null;
}
export declare function listMaintenanceSchedules(customerCode?: string): MaintenanceSchedule[];
export declare function createMaintenanceSchedule(input: {
    customerCode: string;
    siteId?: string;
    title: string;
    dueDate: string;
}): MaintenanceSchedule;
export declare function createMaintenanceReport(input: {
    customerCode: string;
    scheduleId?: string;
    caseId?: string;
    comment?: string;
    photos?: Array<{
        imageBase64: string;
        fileName?: string;
    }>;
    reportedBy?: string;
}): MaintenanceReport;
export declare function listMaintenanceReports(customerCode: string, limit?: number): MaintenanceReport[];

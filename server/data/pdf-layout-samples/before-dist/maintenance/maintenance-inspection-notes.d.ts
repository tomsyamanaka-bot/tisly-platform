export interface MaintenanceInspectionNote {
    customerCode: string;
    memo: string;
    updatedAt: string | null;
    updatedBy: string | null;
}
export declare function getMaintenanceInspectionNote(customerCode: string): MaintenanceInspectionNote;
export declare function saveMaintenanceInspectionNote(input: {
    customerCode: string;
    memo: string;
    updatedBy?: string;
}): MaintenanceInspectionNote;

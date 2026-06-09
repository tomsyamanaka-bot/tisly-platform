export interface MaintenanceCase {
    caseId: string;
    customerCode: string;
    siteId: string | null;
    siteName: string | null;
    deviceIds: string[];
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare function createMaintenanceCase(input: {
    customerCode: string;
    siteId?: string;
    siteName?: string;
    deviceIds?: string[];
    notes?: string;
    status?: string;
}): MaintenanceCase;
export declare function getMaintenanceCase(caseId: string): MaintenanceCase | null;
export declare function listMaintenanceCases(customerCode?: string): MaintenanceCase[];
export declare function updateMaintenanceCase(caseId: string, patch: Partial<{
    siteId: string;
    siteName: string;
    deviceIds: string[];
    status: string;
    notes: string;
}>): MaintenanceCase | null;
export declare function deleteMaintenanceCase(caseId: string): boolean;
export interface RecoveryHistoryEntry {
    id: string;
    deviceId: string;
    status: string;
    success: boolean;
    actor: string | null;
    startedAt: string;
    completedAt: string | null;
}
export declare function listRecoveryHistoryForCustomer(customerCode: string, limit?: number): RecoveryHistoryEntry[];

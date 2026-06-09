import { buildHubOperations } from "./hub-operations.js";
export interface HubOfflineSnapshotPayload {
    customerCode: string;
    savedAt: string;
    operations: ReturnType<typeof buildHubOperations>;
    summary: {
        todaySurveys: number;
        todayConstruction: number;
        uninvoiced: number;
        unpaid: number;
        abnormalDevices: number;
        maintenanceDue: number;
        maintenanceOverdue: number;
    };
}
export declare function buildHubOfflineSnapshot(customerCode: string): HubOfflineSnapshotPayload;

import { listTodaySchedules } from "../business/business-store.js";
import { listMaintenanceDueSoon } from "./maintenance-flow.js";
export interface HubOperationsSnapshot {
    todaySurveys: number;
    todayConstruction: number;
    todayMaintenance: number;
    uninvoiced: number;
    unpaid: number;
    unsentEstimates: number;
    unsentInvoices: number;
    maintenanceDue: number;
    espAnomaly: number;
    shellyAnomaly: number;
    abnormalDevices: number;
    pendingSync: number;
    aiEstimatePending: number;
    maintenanceDueSoon: number;
    maintenanceOverdue: number;
    retryQueuePending: number;
    schedules: ReturnType<typeof listTodaySchedules>;
    maintenanceDueList: ReturnType<typeof listMaintenanceDueSoon>;
}
export declare function buildHubOperations(customerCode: string): HubOperationsSnapshot;

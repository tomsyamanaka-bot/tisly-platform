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

export function buildHubOfflineSnapshot(customerCode: string): HubOfflineSnapshotPayload {
  const operations = buildHubOperations(customerCode);
  return {
    customerCode: customerCode.toUpperCase(),
    savedAt: new Date().toISOString(),
    operations,
    summary: {
      todaySurveys: operations.todaySurveys,
      todayConstruction: operations.todayConstruction,
      uninvoiced: operations.uninvoiced,
      unpaid: operations.unpaid,
      abnormalDevices: operations.abnormalDevices,
      maintenanceDue: operations.maintenanceDue,
      maintenanceOverdue: operations.maintenanceOverdue,
    },
  };
}

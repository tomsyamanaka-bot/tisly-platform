import { buildHubOperations } from "./hub-operations.js";
export function buildHubOfflineSnapshot(customerCode) {
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

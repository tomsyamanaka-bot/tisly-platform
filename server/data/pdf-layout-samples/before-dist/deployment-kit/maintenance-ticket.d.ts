/**
 * Phase 1001–1040 — Maintenance tickets for deployed customers
 */
import { getMaintenanceCase, listMaintenanceCases, updateMaintenanceCase } from "../maintenance/maintenance-store.js";
export declare function createCustomerMaintenanceRequest(input: {
    customerCode: string;
    siteId?: string;
    siteName?: string;
    deviceIds?: string[];
    notes?: string;
}): import("../maintenance/maintenance-store.js").MaintenanceCase;
export declare function completeMaintenanceTicket(caseId: string, notes?: string): import("../maintenance/maintenance-store.js").MaintenanceCase | null;
export declare function getCustomerMaintenanceSummary(customerCode: string): {
    customerCode: string;
    customerName: string;
    openCount: number;
    resolvedCount: number;
    cases: import("../maintenance/maintenance-store.js").MaintenanceCase[];
    recoveryHistory: import("../maintenance/maintenance-store.js").RecoveryHistoryEntry[];
    maintenanceContact: {
        phone: string;
        email: string;
        hours: string;
    };
} | null;
export { getMaintenanceCase, listMaintenanceCases, updateMaintenanceCase };

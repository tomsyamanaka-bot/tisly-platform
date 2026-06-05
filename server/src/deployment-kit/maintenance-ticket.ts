/**
 * Phase 1001–1040 — Maintenance tickets for deployed customers
 */
import {
  createMaintenanceCase,
  getMaintenanceCase,
  listMaintenanceCases,
  updateMaintenanceCase,
  listRecoveryHistoryForCustomer,
} from "../maintenance/maintenance-store.js";
import { getCustomerByCode } from "../customer/customer-store.js";

export function createCustomerMaintenanceRequest(input: {
  customerCode: string;
  siteId?: string;
  siteName?: string;
  deviceIds?: string[];
  notes?: string;
}) {
  const customer = getCustomerByCode(input.customerCode);
  if (!customer) throw new Error("customer not found");

  return createMaintenanceCase({
    customerCode: customer.customer_code,
    siteId: input.siteId,
    siteName: input.siteName,
    deviceIds: input.deviceIds,
    notes: input.notes,
    status: "open",
  });
}

export function completeMaintenanceTicket(caseId: string, notes?: string) {
  return updateMaintenanceCase(caseId, { status: "resolved", notes });
}

export function getCustomerMaintenanceSummary(customerCode: string) {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return null;

  const cases = listMaintenanceCases(customerCode);
  const history = listRecoveryHistoryForCustomer(customer.customer_code);

  return {
    customerCode: customer.customer_code,
    customerName: customer.customer_name,
    openCount: cases.filter((c) => c.status === "open" || c.status === "in_progress").length,
    resolvedCount: cases.filter((c) => c.status === "resolved" || c.status === "closed").length,
    cases,
    recoveryHistory: history,
    maintenanceContact: {
      phone: "03-0000-0000",
      email: "maintenance@tisly.jp",
      hours: "平日 9:00–18:00",
    },
  };
}

export { getMaintenanceCase, listMaintenanceCases, updateMaintenanceCase };

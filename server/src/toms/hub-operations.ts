import { getDatabase } from "../db/database.js";
import { countProjectsByStatus, listTodaySchedules } from "../business/business-store.js";
import { expandStatusAliases } from "../business/business-status.js";
import type { BusinessProjectStatus } from "../business/business-types.js";

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
  schedules: ReturnType<typeof listTodaySchedules>;
}

export function buildHubOperations(customerCode: string): HubOperationsSnapshot {
  const code = customerCode.toUpperCase();
  const schedules = listTodaySchedules();
  const todaySurveys = schedules.filter((s) => s.kind === "site_survey").length;
  const todayConstruction = schedules.filter((s) => s.kind === "construction").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  let todayMaintenance = 0;
  try {
    todayMaintenance = (
      getDatabase()
        .prepare(
          `SELECT COUNT(*) as c FROM toms_project_maintenance
           WHERE scheduled_date = ? AND status != 'closed'`
        )
        .get(todayStr) as { c: number }
    ).c;
  } catch {
    todayMaintenance = 0;
  }

  const uninvoiced = countProjectsByStatus(
    expandStatusAliases([
      "construction_done",
      "completion_report_created",
    ]) as BusinessProjectStatus[]
  );

  const unpaid = countProjectsByStatus(
    expandStatusAliases(["invoice_sent", "partial_paid"]) as BusinessProjectStatus[]
  );

  const unsentEstimates = countProjectsByStatus(
    expandStatusAliases(["estimate_created"]) as BusinessProjectStatus[]
  );

  const unsentInvoices = countProjectsByStatus(
    expandStatusAliases(["invoice_created"]) as BusinessProjectStatus[]
  );

  const maintenanceDue = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM maintenance_cases
         WHERE customer_code = ? AND status IN ('open','in_progress')`
      )
      .get(code) as { c: number }
  ).c;

  const devices = getDatabase()
    .prepare(
      `SELECT device_type, last_seen, commissioning_status FROM devices WHERE customer_id = ?`
    )
    .all(code) as Array<{
    device_type: string;
    last_seen: string | null;
    commissioning_status: string;
  }>;

  const staleMs = 15 * 60 * 1000;
  const now = Date.now();
  let espAnomaly = 0;
  let shellyAnomaly = 0;
  let abnormalDevices = 0;
  for (const d of devices) {
    const last = d.last_seen ? new Date(d.last_seen).getTime() : 0;
    const stale = !last || now - last > staleMs;
    const t = String(d.device_type ?? "").toLowerCase();
    if (stale) {
      abnormalDevices++;
      if (t.includes("esp") || t.includes("controller")) espAnomaly++;
      if (t.includes("shelly")) shellyAnomaly++;
    }
  }

  const pendingSync = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM business_integration_logs
         WHERE status = 'skipped' AND created_at > datetime('now', '-7 days')`
      )
      .get() as { c: number }
  ).c;

  const aiEstimatePending = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM business_projects p
         WHERE p.status IN ('survey_done','estimate_draft')
         AND NOT EXISTS (SELECT 1 FROM toms_ai_estimate_v3 v WHERE v.project_id = p.id)`
      )
      .get() as { c: number }
  ).c;

  return {
    todaySurveys,
    todayConstruction,
    todayMaintenance,
    uninvoiced,
    unpaid,
    unsentEstimates,
    unsentInvoices,
    maintenanceDue,
    espAnomaly,
    shellyAnomaly,
    abnormalDevices,
    pendingSync,
    aiEstimatePending,
    schedules,
  };
}

import { getDatabase } from "../db/database.js";
import { countProjectsByStatus, listTodaySchedules } from "../business/business-store.js";
import { expandStatusAliases } from "../business/business-status.js";
import type { BusinessProjectStatus } from "../business/business-types.js";

export interface HubOperationsSnapshot {
  todaySurveys: number;
  todayConstruction: number;
  uninvoiced: number;
  unpaid: number;
  maintenanceDue: number;
  espAnomaly: number;
  shellyAnomaly: number;
  schedules: ReturnType<typeof listTodaySchedules>;
}

export function buildHubOperations(customerCode: string): HubOperationsSnapshot {
  const code = customerCode.toUpperCase();
  const schedules = listTodaySchedules();
  const todaySurveys = schedules.filter((s) => s.kind === "site_survey").length;
  const todayConstruction = schedules.filter((s) => s.kind === "construction").length;

  const uninvoiced = countProjectsByStatus(
    expandStatusAliases([
      "construction_done",
      "completion_report_created",
    ]) as BusinessProjectStatus[]
  );

  const unpaid = countProjectsByStatus(
    expandStatusAliases(["invoice_sent", "partial_paid"]) as BusinessProjectStatus[]
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
  for (const d of devices) {
    const last = d.last_seen ? new Date(d.last_seen).getTime() : 0;
    const stale = !last || now - last > staleMs;
    const t = String(d.device_type ?? "").toLowerCase();
    if (stale) {
      if (t.includes("esp") || t.includes("controller")) espAnomaly++;
      if (t.includes("shelly")) shellyAnomaly++;
    }
  }

  return {
    todaySurveys,
    todayConstruction,
    uninvoiced,
    unpaid,
    maintenanceDue,
    espAnomaly,
    shellyAnomaly,
    schedules,
  };
}

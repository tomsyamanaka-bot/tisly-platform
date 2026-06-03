import { getDatabase } from "../db/database.js";
import { getCustomerInstallChecklist } from "./install-checklist.js";

export interface InstallDashboardStats {
  registered: number;
  unplaced: number;
  untested: number;
  commOk: number;
  commNg: number;
  completionRate: number;
  totalDevices: number;
}

export function getInstallDashboard(customerId: string): InstallDashboardStats {
  const db = getDatabase();
  const devices = db
    .prepare(
      `SELECT device_id, pos_x, commissioning_status, last_test_result, heartbeat_status, last_heartbeat_at
       FROM devices WHERE customer_id = ?`
    )
    .all(customerId) as Array<{
    device_id: string;
    pos_x: number | null;
    commissioning_status: string | null;
    last_test_result: string | null;
    heartbeat_status: string | null;
    last_heartbeat_at: string | null;
  }>;

  let unplaced = 0;
  let untested = 0;
  let commOk = 0;
  let commNg = 0;

  for (const d of devices) {
    if (d.pos_x == null) unplaced++;
    const status = d.commissioning_status ?? "draft";
    if (status === "draft" || status === "claimed") untested++;
    let tests: Record<string, unknown> = {};
    if (d.last_test_result) {
      try {
        tests = JSON.parse(d.last_test_result) as Record<string, unknown>;
      } catch {
        /* */
      }
    }
    const hbOk =
      d.heartbeat_status === "ok" ||
      tests.heartbeat === "ok" ||
      (d.last_heartbeat_at && Date.now() - new Date(d.last_heartbeat_at).getTime() < 600_000);
    if (hbOk || tests.mqttRttMs) commOk++;
    else if (status === "tested" || status === "failed") commNg++;
  }

  const checklist = getCustomerInstallChecklist(customerId);
  const total = devices.length || 1;
  const completionRate =
    checklist.summary.totalDevices > 0
      ? Math.round((checklist.summary.fullyComplete / checklist.summary.totalDevices) * 100)
      : 0;

  return {
    registered: devices.length,
    unplaced,
    untested,
    commOk,
    commNg,
    completionRate,
    totalDevices: devices.length,
  };
}

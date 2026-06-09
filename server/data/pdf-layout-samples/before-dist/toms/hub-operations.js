import { getDatabase } from "../db/database.js";
import { countProjectsByStatus, listTodaySchedules } from "../business/business-store.js";
import { listMaintenanceDueSoon } from "./maintenance-flow.js";
import { expandStatusAliases } from "../business/business-status.js";
export function buildHubOperations(customerCode) {
    const code = customerCode.toUpperCase();
    const schedules = listTodaySchedules();
    const todaySurveys = schedules.filter((s) => s.kind === "site_survey").length;
    const todayConstruction = schedules.filter((s) => s.kind === "construction").length;
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayMaintenance = 0;
    try {
        todayMaintenance = getDatabase()
            .prepare(`SELECT COUNT(*) as c FROM toms_project_maintenance
           WHERE scheduled_date = ? AND status != 'closed'`)
            .get(todayStr).c;
    }
    catch {
        todayMaintenance = 0;
    }
    const uninvoiced = countProjectsByStatus(expandStatusAliases([
        "construction_done",
        "completion_report_created",
    ]));
    const unpaid = countProjectsByStatus(expandStatusAliases(["invoice_sent", "partial_paid"]));
    const unsentEstimates = countProjectsByStatus(expandStatusAliases(["estimate_created"]));
    const unsentInvoices = countProjectsByStatus(expandStatusAliases(["invoice_created"]));
    const dueList = listMaintenanceDueSoon(14);
    const maintenanceDueSoon = dueList.filter((d) => !d.overdue).length;
    const maintenanceOverdue = dueList.filter((d) => d.overdue).length;
    const maintenanceDue = maintenanceDueSoon + maintenanceOverdue;
    const devices = getDatabase()
        .prepare(`SELECT device_type, last_seen, commissioning_status FROM devices WHERE customer_id = ?`)
        .all(code);
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
            if (t.includes("esp") || t.includes("controller"))
                espAnomaly++;
            if (t.includes("shelly"))
                shellyAnomaly++;
        }
    }
    const pendingSync = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM business_integration_logs
         WHERE status = 'skipped' AND created_at > datetime('now', '-7 days')`)
        .get().c;
    let retryQueuePending = 0;
    try {
        retryQueuePending = getDatabase()
            .prepare(`SELECT COUNT(*) as c FROM business_integration_retry_queue
           WHERE status IN ('pending','retrying','failed')`)
            .get().c;
    }
    catch {
        retryQueuePending = 0;
    }
    const aiEstimatePending = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM business_projects p
         WHERE p.status IN ('survey_done','estimate_draft')
         AND NOT EXISTS (SELECT 1 FROM toms_ai_estimate_v3 v WHERE v.project_id = p.id)`)
        .get().c;
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
        maintenanceDueSoon,
        maintenanceOverdue,
        retryQueuePending,
        schedules,
        maintenanceDueList: dueList.slice(0, 10),
    };
}

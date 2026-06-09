import { getDatabase } from "../db/database.js";
import { getCustomerInstallChecklist } from "./install-checklist.js";
export function getInstallDashboard(customerId) {
    const db = getDatabase();
    const devices = db
        .prepare(`SELECT device_id, pos_x, commissioning_status, last_test_result, heartbeat_status, last_heartbeat_at
       FROM devices WHERE customer_id = ?`)
        .all(customerId);
    let unplaced = 0;
    let untested = 0;
    let commOk = 0;
    let commNg = 0;
    for (const d of devices) {
        if (d.pos_x == null)
            unplaced++;
        const status = d.commissioning_status ?? "draft";
        if (status === "draft" || status === "claimed")
            untested++;
        let tests = {};
        if (d.last_test_result) {
            try {
                tests = JSON.parse(d.last_test_result);
            }
            catch {
                /* */
            }
        }
        const hbOk = d.heartbeat_status === "ok" ||
            tests.heartbeat === "ok" ||
            (d.last_heartbeat_at && Date.now() - new Date(d.last_heartbeat_at).getTime() < 600_000);
        if (hbOk || tests.mqttRttMs)
            commOk++;
        else if (status === "tested" || status === "failed")
            commNg++;
    }
    const checklist = getCustomerInstallChecklist(customerId);
    const total = devices.length || 1;
    const completionRate = checklist.summary.totalDevices > 0
        ? Math.round((checklist.summary.fullyComplete / checklist.summary.totalDevices) * 100)
        : 0;
    const nextSteps = [];
    const incompleteOnly = [];
    if (devices.length === 0)
        nextSteps.push("register_device");
    if (unplaced > 0)
        nextSteps.push("map_placement");
    if (untested > 0)
        nextSteps.push("connectivity_test");
    if (commNg > 0)
        nextSteps.push("mqtt_live_test");
    if (checklist.summary.openItems.length)
        nextSteps.push("checklist_complete");
    nextSteps.push("install_photos", "completion_report");
    for (const d of devices) {
        const reasons = [];
        if (d.pos_x == null)
            reasons.push("unplaced");
        const status = d.commissioning_status ?? "draft";
        if (status === "draft" || status === "claimed")
            reasons.push("untested");
        if (reasons.length)
            incompleteOnly.push({ deviceId: d.device_id, reason: reasons.join(",") });
    }
    return {
        registered: devices.length,
        unplaced,
        untested,
        commOk,
        commNg,
        completionRate,
        totalDevices: devices.length,
        nextSteps,
        incompleteOnly,
    };
}

import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { getAnalyticsOverview } from "../../analytics/analytics-engine.js";
import { getRecoveryOverview } from "../../recovery/recovery-engine.js";
import { DEMO_SITES } from "../../demo/demo-sites.js";
import { countBySeverity, countOpenIncidents, scopeFromCustomerCode, } from "../../incidents/incident-store.js";
import { opsCustomerScopeMiddleware } from "../../ops/ops-customer-scope.js";
export const socNocRouter = Router();
function securityEvents(limit = 30, customerId, tenantId) {
    const db = getDatabase();
    if (customerId && tenantId) {
        return db
            .prepare(`SELECT * FROM events
         WHERE event_type IN ('intrusion', 'perimeter', 'window_open', 'door_open', 'estop', 'motion')
           AND (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
         ORDER BY created_at DESC LIMIT ?`)
            .all(tenantId, customerId, limit);
    }
    return db
        .prepare(`SELECT * FROM events
       WHERE event_type IN ('intrusion', 'perimeter', 'window_open', 'door_open', 'estop', 'motion')
       ORDER BY created_at DESC LIMIT ?`)
        .all(limit);
}
function networkHealth(customerId, tenantId) {
    const db = getDatabase();
    if (customerId) {
        const devices = db
            .prepare(`SELECT device_id, device_type, label, device_status, last_heartbeat_at, last_seen,
                heartbeat_status, customer_id, site_id,
                (SELECT event_type FROM events e WHERE e.device_id = devices.device_id
                 ORDER BY created_at DESC LIMIT 1) as last_event_type,
                (SELECT created_at FROM events e WHERE e.device_id = devices.device_id
                 ORDER BY created_at DESC LIMIT 1) as last_event_at
         FROM devices WHERE customer_id = ? ORDER BY updated_at DESC`)
            .all(customerId);
        return { devices, heartbeats: [] };
    }
    const devices = db.prepare("SELECT * FROM devices ORDER BY updated_at DESC").all();
    const heartbeats = db
        .prepare(`SELECT * FROM device_heartbeats ORDER BY received_at DESC LIMIT 20`)
        .all();
    return { devices, heartbeats };
}
socNocRouter.get("/summary", opsCustomerScopeMiddleware, (req, res) => {
    const code = req.opsScope?.customerCode ?? "ALL";
    const scope = scopeFromCustomerCode(code === "ALL" ? undefined : code);
    const sev = countBySeverity(scope === null ? null : scope);
    const openIncidents = countOpenIncidents(scope === null ? null : scope);
    const db = getDatabase();
    let tvOffline = 0;
    let qnapWarning = 0;
    let recoveryPending = 0;
    try {
        if (req.opsScope?.customerId) {
            tvOffline = db
                .prepare(`SELECT COUNT(*) as c FROM tv_devices
             WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
               AND (status != 'active' OR last_seen_at IS NULL)`)
                .get(req.opsScope.customerId, req.opsScope.customerId).c;
            recoveryPending = openIncidents;
        }
        else {
            tvOffline = db
                .prepare(`SELECT COUNT(*) as c FROM tv_devices WHERE status != 'active' OR last_seen_at IS NULL`)
                .get().c;
        }
        qnapWarning = db.prepare(`SELECT COUNT(*) as c FROM qnap_archives WHERE status = 'warning'`).get()?.c ?? 0;
    }
    catch {
        /* optional tables */
    }
    if (!recoveryPending)
        recoveryPending = openIncidents;
    res.json({
        customerScope: code,
        openIncidents,
        criticalCount: sev.critical,
        alarmCount: sev.alarm,
        recoveryPending,
        tvOffline,
        qnapWarning,
    });
});
socNocRouter.get("/soc", opsCustomerScopeMiddleware, (req, res) => {
    const analytics = getAnalyticsOverview();
    const cid = req.opsScope?.customerId;
    const tid = req.opsScope?.tenantId;
    res.json({
        mode: "soc",
        label: "Security Operations Center",
        customerScope: req.opsScope?.customerCode ?? "ALL",
        sites: DEMO_SITES,
        alarms: securityEvents(20, cid, tid),
        risk: analytics.risk,
        summary: analytics.summary.today,
        nlReport: analytics.naturalLanguage.today,
        recovery: {
            openIncidents: countOpenIncidents(cid ? { customerId: cid, tenantId: tid } : null),
        },
    });
});
socNocRouter.get("/noc", opsCustomerScopeMiddleware, (req, res) => {
    const db = getDatabase();
    const cid = req.opsScope?.customerId;
    const tid = req.opsScope?.tenantId;
    let offline = db
        .prepare(`SELECT * FROM devices WHERE heartbeat_status != 'ok' ORDER BY updated_at DESC`)
        .all();
    if (cid) {
        offline = db
            .prepare(`SELECT * FROM devices WHERE heartbeat_status != 'ok'
         AND (customer_id = ? OR tenant_id = ?) ORDER BY updated_at DESC`)
            .all(cid, tid ?? cid);
    }
    res.json({
        mode: "noc",
        label: "Network Operations Center",
        customerScope: req.opsScope?.customerCode ?? "ALL",
        health: networkHealth(cid, tid),
        mqttConnected: true,
        offlineDevices: offline,
        sla: getRecoveryOverview().sla,
        mttr: getRecoveryOverview().mttr,
    });
});

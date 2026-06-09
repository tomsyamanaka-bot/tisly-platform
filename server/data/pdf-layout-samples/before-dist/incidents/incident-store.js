import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode, listCustomers } from "../customer/customer-store.js";
import { logAudit } from "../provisioning/audit-log.js";
import { incidentToRecoveryView, mapDbIncident, } from "./incident-converter.js";
import { canTransition, isOpenStatus, } from "./incident-status.js";
export function scopeFromCustomerCode(customerCode) {
    if (!customerCode || customerCode === "ALL")
        return {};
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    return {
        customerId: customer.customer_id,
        tenantId: customer.tenant_id ?? customer.customer_id,
    };
}
function scopeWhere(scope) {
    if (scope === null)
        return { sql: "1=0", params: [] };
    if (!scope.customerId && !scope.tenantId)
        return { sql: "1=1", params: [] };
    return {
        sql: "(customer_id = ? OR tenant_id = ?)",
        params: [scope.customerId, scope.tenantId],
    };
}
export function listIncidents(scope, opts) {
    const sw = scopeWhere(scope);
    let sql = `SELECT id, device_id, site_id, customer_id, tenant_id, status, severity, title,
                    opened_at, closed_at, created_at
             FROM incidents WHERE ${sw.sql}`;
    const params = [...sw.params];
    if (opts?.status) {
        sql += " AND status = ?";
        params.push(opts.status);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(opts?.limit ?? 100);
    try {
        const rows = getDatabase().prepare(sql).all(...params);
        return rows.map(mapDbIncident);
    }
    catch {
        return [];
    }
}
export function getIncidentById(id, scope) {
    const row = getDatabase()
        .prepare(`SELECT id, device_id, site_id, customer_id, tenant_id, status, severity, title,
              opened_at, closed_at, created_at
       FROM incidents WHERE id = ?`)
        .get(id);
    if (!row)
        return null;
    const inc = mapDbIncident(row);
    if (scope?.customerId || scope?.tenantId) {
        const allowed = inc.customer_id === scope.customerId ||
            inc.tenant_id === scope.tenantId ||
            inc.customer_id === scope.tenantId;
        if (!allowed)
            return null;
    }
    return inc;
}
export function listRecoveryHistory(tenantOrCustomerId, limit = 20) {
    return listIncidents({ customerId: tenantOrCustomerId, tenantId: tenantOrCustomerId }, { limit }).map(incidentToRecoveryView);
}
export function countOpenIncidents(scope) {
    const rows = listIncidents(scope, { limit: 500 });
    return rows.filter((r) => isOpenStatus(r.status)).length;
}
export function countBySeverity(scope) {
    const rows = listIncidents(scope, { limit: 500 });
    const openRows = rows.filter((r) => isOpenStatus(r.status));
    return {
        open: openRows.length,
        critical: openRows.filter((r) => r.severity === "critical").length,
        alarm: openRows.filter((r) => r.severity === "alarm").length,
        warning: openRows.filter((r) => r.severity === "warning").length,
    };
}
export function updateIncidentStatus(id, status, actor, scope, ip) {
    const existing = getIncidentById(id, scope);
    if (!existing)
        return false;
    if (!canTransition(existing.status, status))
        return false;
    const extra = status === "closed" || status === "resolved"
        ? ", closed_at = datetime('now')"
        : "";
    const r = getDatabase()
        .prepare(`UPDATE incidents SET status = ?${extra} WHERE id = ?`)
        .run(status, id);
    if (r.changes === 0)
        return false;
    logAudit({
        tenantId: existing.customer_id ?? undefined,
        userId: actor.userId,
        actorLabel: actor.username,
        action: `incident.${status}`,
        targetType: "incident",
        targetId: id,
        ipAddress: ip,
    });
    return true;
}
export function ensureDemoIncidents() {
    const marker = getDatabase()
        .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
        .get("migration:soc_incidents_demo");
    if (marker)
        return;
    const customers = listCustomers(false).filter((c) => ["TOMS001", "HOTEL001", "PLANT001"].includes(c.customer_code));
    for (const c of customers) {
        const id = uuid();
        getDatabase()
            .prepare(`INSERT INTO incidents (id, device_id, site_id, status, severity, title, customer_id, tenant_id, opened_at, created_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?, datetime('now'), datetime('now'))`)
            .run(id, `demo-device-${c.customer_code.toLowerCase()}`, null, c.customer_code === "TOMS001" ? "critical" : c.customer_code === "HOTEL001" ? "alarm" : "warning", `Demo incident — ${c.customer_name}`, c.customer_id, c.tenant_id ?? c.customer_id);
    }
    try {
        getDatabase()
            .prepare(`INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`)
            .run("migration:soc_incidents_demo", JSON.stringify({ at: new Date().toISOString() }));
    }
    catch {
        /* optional */
    }
}

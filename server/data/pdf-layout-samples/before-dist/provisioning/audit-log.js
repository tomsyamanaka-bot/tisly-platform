import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
function clientIp(req) {
    const ip = req.ip;
    if (typeof ip === "string")
        return ip;
    if (Array.isArray(ip))
        return ip[0];
    return undefined;
}
export function auditContextFromRequest(req) {
    const authed = req;
    return {
        ipAddress: clientIp(req),
        userAgent: req.header("user-agent") ?? undefined,
        userId: authed.admin?.userId,
        actorLabel: authed.admin?.username,
    };
}
export function logAudit(input) {
    const id = uuid();
    const userId = input.userId ?? input.actorId ?? "system";
    const targetType = input.targetType ?? input.entityType ?? null;
    const targetId = input.targetId ?? input.entityId ?? null;
    const beforeJson = input.beforeJson
        ? JSON.stringify(input.beforeJson)
        : null;
    const afterJson = input.afterJson
        ? JSON.stringify(input.afterJson)
        : input.details
            ? JSON.stringify(input.details)
            : null;
    getDatabase()
        .prepare(`INSERT INTO audit_logs (
         id, tenant_id, site_id, actor_id, actor_label, action,
         entity_type, entity_id, details_json,
         user_id, target_type, target_id, before_json, after_json, ip_address, user_agent
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.tenantId ?? null, input.siteId ?? null, userId, input.actorLabel ?? "TiSLY System", input.action, targetType, targetId, input.details ? JSON.stringify(input.details) : null, userId, targetType, targetId, beforeJson, afterJson, input.ipAddress ?? null, input.userAgent ?? null);
    return id;
}
export function listAuditLogs(opts) {
    const limit = opts.limit ?? 100;
    let sql = "SELECT * FROM audit_logs WHERE 1=1";
    const params = [];
    if (opts.tenantId) {
        sql += " AND tenant_id = ?";
        params.push(opts.tenantId);
    }
    if (opts.siteId) {
        sql += " AND site_id = ?";
        params.push(opts.siteId);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    const rows = getDatabase().prepare(sql).all(...params);
    return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        siteId: r.site_id,
        userId: r.user_id ?? r.actor_id,
        actorLabel: r.actor_label,
        action: r.action,
        targetType: r.target_type ?? r.entity_type,
        targetId: r.target_id ?? r.entity_id,
        before: r.before_json ? JSON.parse(r.before_json) : null,
        after: r.after_json ? JSON.parse(r.after_json) : r.details_json ? JSON.parse(r.details_json) : null,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
    }));
}

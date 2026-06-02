import { v4 as uuid } from "uuid";
import type { Request } from "express";
import { getDatabase } from "../db/database.js";

export interface AuditEntryInput {
  tenantId?: string;
  siteId?: string;
  userId?: string;
  actorId?: string;
  actorLabel?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  targetType?: string;
  targetId?: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

function clientIp(req: Request): string | undefined {
  const ip = req.ip;
  if (typeof ip === "string") return ip;
  if (Array.isArray(ip)) return ip[0];
  return undefined;
}

export function auditContextFromRequest(req: Request): {
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  actorLabel?: string;
} {
  const authed = req as Request & { admin?: { userId: string; username: string } };
  return {
    ipAddress: clientIp(req),
    userAgent: req.header("user-agent") ?? undefined,
    userId: authed.admin?.userId,
    actorLabel: authed.admin?.username,
  };
}

export function logAudit(input: AuditEntryInput): string {
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
    .prepare(
      `INSERT INTO audit_logs (
         id, tenant_id, site_id, actor_id, actor_label, action,
         entity_type, entity_id, details_json,
         user_id, target_type, target_id, before_json, after_json, ip_address, user_agent
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.tenantId ?? null,
      input.siteId ?? null,
      userId,
      input.actorLabel ?? "TiSLY System",
      input.action,
      targetType,
      targetId,
      input.details ? JSON.stringify(input.details) : null,
      userId,
      targetType,
      targetId,
      beforeJson,
      afterJson,
      input.ipAddress ?? null,
      input.userAgent ?? null
    );
  return id;
}

export function listAuditLogs(opts: {
  tenantId?: string;
  siteId?: string;
  limit?: number;
}) {
  const limit = opts.limit ?? 100;
  let sql = "SELECT * FROM audit_logs WHERE 1=1";
  const params: unknown[] = [];
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
  const rows = getDatabase().prepare(sql).all(...params) as Array<{
    id: string;
    tenant_id: string | null;
    site_id: string | null;
    user_id: string | null;
    actor_id: string | null;
    actor_label: string | null;
    action: string;
    target_type: string | null;
    entity_type: string | null;
    target_id: string | null;
    entity_id: string | null;
    before_json: string | null;
    after_json: string | null;
    details_json: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }>;
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

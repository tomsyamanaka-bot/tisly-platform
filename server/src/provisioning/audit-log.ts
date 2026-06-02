import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export interface AuditEntryInput {
  tenantId?: string;
  siteId?: string;
  actorId?: string;
  actorLabel?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export function logAudit(input: AuditEntryInput): string {
  const id = uuid();
  getDatabase()
    .prepare(
      `INSERT INTO audit_logs (id, tenant_id, site_id, actor_id, actor_label, action, entity_type, entity_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.tenantId ?? null,
      input.siteId ?? null,
      input.actorId ?? "system",
      input.actorLabel ?? "TiSLY System",
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.details ? JSON.stringify(input.details) : null
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
    actor_id: string | null;
    actor_label: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details_json: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    siteId: r.site_id,
    actorId: r.actor_id,
    actorLabel: r.actor_label,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details_json ? JSON.parse(r.details_json) : null,
    createdAt: r.created_at,
  }));
}

/**
 * Phase 301-320 — export events for Postgres migration (tenant-scoped).
 */
import type { Database } from "better-sqlite3";

export function exportEventsForPostgres(
  sqlite: Database,
  limit = 500_000
): Array<Record<string, unknown>> {
  return sqlite
    .prepare(
      `SELECT id, event_id, tenant_id, site_id, device_id, event_type, severity,
              title, message, zone, source_type, payload_json, created_at
       FROM events ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
}

/**
 * Phase 301-320 — export incidents for Postgres migration.
 */
import type { Database } from "better-sqlite3";

export function exportIncidentsForPostgres(sqlite: Database): Array<Record<string, unknown>> {
  return sqlite
    .prepare(
      `SELECT id, tenant_id, customer_id, site_id, status, severity, title,
              description, created_at, updated_at, closed_at
       FROM incidents ORDER BY created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;
}

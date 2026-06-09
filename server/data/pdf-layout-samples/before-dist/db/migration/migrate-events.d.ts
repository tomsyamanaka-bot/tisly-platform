/**
 * Phase 301-320 — export events for Postgres migration (tenant-scoped).
 */
import type { Database } from "better-sqlite3";
export declare function exportEventsForPostgres(sqlite: Database, limit?: number): Array<Record<string, unknown>>;

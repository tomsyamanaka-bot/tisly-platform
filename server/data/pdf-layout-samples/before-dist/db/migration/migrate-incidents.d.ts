/**
 * Phase 301-320 — export incidents for Postgres migration.
 */
import type { Database } from "better-sqlite3";
export declare function exportIncidentsForPostgres(sqlite: Database): Array<Record<string, unknown>>;

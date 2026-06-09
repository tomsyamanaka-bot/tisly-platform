/**
 * Phase 301-320 — migrate customers billing columns to Postgres.
 * Run via migrate-cli or sqlite-to-postgres pipeline.
 */
import type { Database } from "better-sqlite3";
export declare function exportCustomersForPostgres(sqlite: Database): Array<Record<string, unknown>>;

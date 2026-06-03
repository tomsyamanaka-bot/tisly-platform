import type Database from "better-sqlite3";
import { pgQueryOne } from "../postgres/query.js";
import { pingPostgres } from "../postgres/pool.js";

export interface MigrationVerifyResult {
  ok: boolean;
  sqliteCounts: Record<string, number>;
  postgresCounts: Record<string, number>;
  mismatches: string[];
}

const VERIFY_TABLES = ["events", "devices", "tv_devices", "audit_logs", "device_credentials"];

export function countSqliteTables(db: Database.Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of VERIFY_TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
      counts[table] = row.c;
    } catch {
      counts[table] = -1;
    }
  }
  return counts;
}

export async function verifyMigration(
  db: Database.Database
): Promise<MigrationVerifyResult> {
  const sqliteCounts = countSqliteTables(db);
  const postgresCounts: Record<string, number> = {};
  const mismatches: string[] = [];

  if (!(await pingPostgres())) {
    return {
      ok: false,
      sqliteCounts,
      postgresCounts,
      mismatches: ["PostgreSQL not reachable"],
    };
  }

  for (const table of VERIFY_TABLES) {
    try {
      const row = await pgQueryOne<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${table}`);
      postgresCounts[table] = row ? Number(row.c) : 0;
      if (sqliteCounts[table] >= 0 && postgresCounts[table] < sqliteCounts[table]) {
        mismatches.push(
          `${table}: sqlite=${sqliteCounts[table]} postgres=${postgresCounts[table]}`
        );
      }
    } catch (e) {
      postgresCounts[table] = -1;
      mismatches.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    ok: mismatches.length === 0,
    sqliteCounts,
    postgresCounts,
    mismatches,
  };
}

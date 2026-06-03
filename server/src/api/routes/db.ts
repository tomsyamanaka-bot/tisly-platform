import { Router } from "express";
import { config } from "../../config.js";
import { getDbProvider } from "../../db/db-provider.js";
import { PostgresProvider } from "../../db/postgres-provider.js";
import { getDatabase } from "../../db/database.js";
import { getAppliedMigrations } from "../../db/postgres/migration-version.js";

export const dbRouter = Router();

dbRouter.get("/status", async (_req, res) => {
  const provider = getDbProvider();
  let version: string | null = null;
  let migration: string | null = null;
  let tableCount: number | null = null;
  let reachable = provider.ping();

  if (provider.type === "postgres" && provider instanceof PostgresProvider) {
    const detail = await provider.statusDetail();
    version = detail.version;
    migration = detail.migration;
    tableCount = detail.tableCount;
    reachable = detail.reachable;
    if (!migration) {
      try {
        const applied = await getAppliedMigrations();
        migration = applied.length ? applied[applied.length - 1]! : null;
      } catch {
        /* ignore */
      }
    }
  } else {
    try {
      const db = getDatabase();
      db.prepare("SELECT 1").get();
      reachable = true;
      tableCount = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
          )
          .get() as { c: number }
      ).c;
      migration = "sqlite-schema-phase-production";
      version = "sqlite3";
    } catch {
      reachable = false;
    }
  }

  res.json({
    provider: config.dbProvider,
    version,
    migration,
    table_count: tableCount,
    reachable,
  });
});

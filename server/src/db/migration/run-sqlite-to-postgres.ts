#!/usr/bin/env tsx
/**
 * CLI: npm run migrate:sqlite-to-postgres
 * Export SQLite → import PostgreSQL → verify row counts.
 */
import path from "path";
import { getDatabase } from "../database.js";
import { runPostgresMigrations } from "../migration-runner.js";
import { writeSqliteExport } from "./export-sqlite.js";
import { importBundleToPostgres } from "./import-postgres.js";
import { verifyMigration } from "./verify.js";
import fs from "fs";

async function main(): Promise<void> {
  const db = getDatabase();
  const exportPath = path.join(process.cwd(), "data", "migration", "sqlite-export.json");

  console.log("[migrate] Applying PostgreSQL schema…");
  const mig = await runPostgresMigrations();
  if (!mig.ok) {
    console.error("[migrate] Schema migration failed:", mig.pending);
    process.exit(1);
  }

  console.log("[migrate] Exporting SQLite…", exportPath);
  const bundle = writeSqliteExport(db, exportPath);
  const rowTotal = Object.values(bundle.tables).reduce(
    (n, rows) => n + (Array.isArray(rows) ? rows.length : 0),
    0
  );
  console.log("[migrate] Exported rows:", rowTotal);

  const raw = fs.readFileSync(exportPath, "utf-8");
  const parsed = JSON.parse(raw) as typeof bundle;
  console.log("[migrate] Importing to PostgreSQL…");
  const imp = await importBundleToPostgres(parsed);
  console.log("[migrate] Import result:", imp);

  const verify = await verifyMigration(db);
  console.log("[migrate] Verify:", verify);
  if (!verify.ok) {
    console.error("[migrate] Verification mismatches:", verify.mismatches);
    process.exit(1);
  }
  console.log("[migrate] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

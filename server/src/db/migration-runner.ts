import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDatabase } from "./database.js";
import { runMigrations } from "./migrate.js";
import type { DbProviderType } from "./db-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MigrationStatus {
  provider: DbProviderType;
  applied: string[];
  pending: string[];
  ok: boolean;
}

const SQLITE_SCHEMA_FILES = [
  "schema.sql",
  "schema-phase81.sql",
  "schema-phase-rc1.sql",
  "schema-phase-security.sql",
  "schema-phase-production.sql",
];

export function runSqliteMigrations(db: Database.Database = getDatabase()): MigrationStatus {
  const applied: string[] = [];
  for (const file of SQLITE_SCHEMA_FILES) {
    const full = path.join(__dirname, file);
    if (!fs.existsSync(full)) continue;
    db.exec(fs.readFileSync(full, "utf-8"));
    applied.push(file);
  }
  runMigrations(db);
  return { provider: "sqlite", applied, pending: [], ok: true };
}

export function runPostgresMigrations(): MigrationStatus {
  // TODO: connect pg Pool, apply postgres/schema.postgres.sql + indexes.postgres.sql
  const postgresDir = path.join(__dirname, "postgres");
  const pending: string[] = [];
  for (const file of ["schema.postgres.sql", "indexes.postgres.sql"]) {
    if (fs.existsSync(path.join(postgresDir, file))) pending.push(file);
  }
  return {
    provider: "postgres",
    applied: [],
    pending,
    ok: false,
  };
}

export function runMigrationsForProvider(): MigrationStatus {
  if (config.dbProvider === "postgres") {
    return runPostgresMigrations();
  }
  return runSqliteMigrations();
}

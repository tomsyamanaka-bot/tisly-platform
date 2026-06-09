import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { getDatabase } from "./database.js";
import { runMigrations } from "./migrate.js";
import { pingPostgres } from "./postgres/pool.js";
import { pgQuery } from "./postgres/query.js";
import { getAppliedMigrations, recordMigration } from "./postgres/migration-version.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SQLITE_SCHEMA_FILES = [
    "schema.sql",
    "schema-phase81.sql",
    "schema-phase-rc1.sql",
    "schema-phase-security.sql",
    "schema-phase-production.sql",
];
export function runSqliteMigrations(db = getDatabase()) {
    const applied = [];
    for (const file of SQLITE_SCHEMA_FILES) {
        const full = path.join(__dirname, file);
        if (!fs.existsSync(full))
            continue;
        db.exec(fs.readFileSync(full, "utf-8"));
        applied.push(file);
    }
    runMigrations(db);
    return { provider: "sqlite", applied, pending: [], ok: true };
}
export async function runPostgresMigrations() {
    const postgresDir = path.join(__dirname, "postgres");
    const files = ["schema.postgres.sql", "indexes.postgres.sql"];
    const pending = [];
    const applied = [];
    if (!(await pingPostgres())) {
        for (const file of files) {
            if (fs.existsSync(path.join(postgresDir, file)))
                pending.push(file);
        }
        return { provider: "postgres", applied, pending, ok: false };
    }
    const already = new Set(await getAppliedMigrations());
    for (const file of files) {
        const full = path.join(postgresDir, file);
        if (!fs.existsSync(full))
            continue;
        if (already.has(file)) {
            applied.push(file);
            continue;
        }
        const sql = fs.readFileSync(full, "utf-8");
        const statements = sql
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith("--"));
        for (const statement of statements) {
            await pgQuery(statement);
        }
        await recordMigration(file);
        applied.push(file);
    }
    return { provider: "postgres", applied, pending, ok: pending.length === 0 };
}
export function runMigrationsForProvider() {
    if (config.dbProvider === "postgres") {
        return { provider: "postgres", applied: [], pending: [], ok: false };
    }
    return runSqliteMigrations();
}
export async function runMigrationsForProviderAsync() {
    if (config.dbProvider === "postgres") {
        return runPostgresMigrations();
    }
    return runSqliteMigrations();
}

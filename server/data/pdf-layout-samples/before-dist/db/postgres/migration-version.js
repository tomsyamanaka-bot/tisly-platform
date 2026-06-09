import { pgQuery, pgQueryOne } from "./query.js";
import { pingPostgres } from "./pool.js";
const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
`;
export async function ensureMigrationTable() {
    await pgQuery(MIGRATION_TABLE_SQL);
}
export async function getAppliedMigrations() {
    if (!(await pingPostgres()))
        return [];
    await ensureMigrationTable();
    const rows = await pgQuery("SELECT version FROM schema_migrations ORDER BY version");
    return rows.rows.map((r) => r.version);
}
export async function recordMigration(version) {
    await ensureMigrationTable();
    await pgQuery(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, [version]);
}
export async function getMigrationVersion() {
    const latest = await pgQueryOne("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
    return latest?.version ?? null;
}

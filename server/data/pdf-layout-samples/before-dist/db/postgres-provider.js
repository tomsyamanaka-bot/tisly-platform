import { config } from "../config.js";
import { pingPostgres, getPostgresLastError } from "./postgres/pool.js";
import { getMigrationVersion } from "./postgres/migration-version.js";
import { pgQueryOne } from "./postgres/query.js";
/**
 * PostgreSQL provider — Phase 201-220 production infrastructure.
 */
export class PostgresProvider {
    type = "postgres";
    cachedReachable = null;
    cachedAt = 0;
    sqlite() {
        return null;
    }
    ping() {
        if (!config.postgres.host || !config.postgres.database)
            return false;
        const now = Date.now();
        if (this.cachedReachable !== null && now - this.cachedAt < 5_000) {
            return this.cachedReachable;
        }
        return false;
    }
    async pingAsync() {
        if (!config.postgres.host || !config.postgres.database)
            return false;
        const ok = await pingPostgres();
        this.cachedReachable = ok;
        this.cachedAt = Date.now();
        return ok;
    }
    info() {
        const reachable = this.ping();
        return {
            provider: "postgres",
            reachable,
            detail: reachable
                ? undefined
                : getPostgresLastError() ??
                    "PostgreSQL not reachable — check POSTGRES_* or DATABASE_URL",
        };
    }
    async statusDetail() {
        const reachable = await this.pingAsync();
        if (!reachable) {
            return { version: null, migration: null, tableCount: null, reachable: false };
        }
        let version = null;
        let tableCount = null;
        let migration = null;
        try {
            const ver = await pgQueryOne("SELECT version() AS version");
            version = ver?.version ?? null;
            const cnt = await pgQueryOne(`SELECT COUNT(*)::text AS c FROM information_schema.tables WHERE table_schema = 'public'`);
            tableCount = cnt ? Number(cnt.c) : null;
            migration = await getMigrationVersion();
        }
        catch {
            /* pool may have failed mid-request */
        }
        return { version, migration, tableCount, reachable };
    }
}

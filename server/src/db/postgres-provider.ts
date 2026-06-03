import { config } from "../config.js";
import type { DbProvider, DbProviderInfo } from "./db-provider.js";
import { pingPostgres, getPostgresLastError } from "./postgres/pool.js";
import { getMigrationVersion } from "./postgres/migration-version.js";
import { pgQueryOne } from "./postgres/query.js";

/**
 * PostgreSQL provider — Phase 201-220 production infrastructure.
 */
export class PostgresProvider implements DbProvider {
  readonly type = "postgres" as const;
  private cachedReachable: boolean | null = null;
  private cachedAt = 0;

  sqlite() {
    return null;
  }

  ping(): boolean {
    if (!config.postgres.host || !config.postgres.database) return false;
    const now = Date.now();
    if (this.cachedReachable !== null && now - this.cachedAt < 5_000) {
      return this.cachedReachable;
    }
    return false;
  }

  async pingAsync(): Promise<boolean> {
    if (!config.postgres.host || !config.postgres.database) return false;
    const ok = await pingPostgres();
    this.cachedReachable = ok;
    this.cachedAt = Date.now();
    return ok;
  }

  info(): DbProviderInfo {
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

  async statusDetail(): Promise<{
    version: string | null;
    migration: string | null;
    tableCount: number | null;
    reachable: boolean;
  }> {
    const reachable = await this.pingAsync();
    if (!reachable) {
      return { version: null, migration: null, tableCount: null, reachable: false };
    }
    let version: string | null = null;
    let tableCount: number | null = null;
    let migration: string | null = null;
    try {
      const ver = await pgQueryOne<{ version: string }>("SELECT version() AS version");
      version = ver?.version ?? null;
      const cnt = await pgQueryOne<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.tables WHERE table_schema = 'public'`
      );
      tableCount = cnt ? Number(cnt.c) : null;
      migration = await getMigrationVersion();
    } catch {
      /* pool may have failed mid-request */
    }
    return { version, migration, tableCount, reachable };
  }
}

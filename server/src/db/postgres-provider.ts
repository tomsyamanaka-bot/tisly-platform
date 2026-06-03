import { config } from "../config.js";
import type { DbProvider, DbProviderInfo } from "./db-provider.js";

/**
 * PostgreSQL connection layer — placeholder for Phase 201+ full migration.
 * TODO: wire `pg` Pool, run schema.postgres.sql on connect.
 */
export class PostgresProvider implements DbProvider {
  readonly type = "postgres" as const;

  sqlite() {
    return null;
  }

  ping(): boolean {
    if (!config.postgres.host || !config.postgres.database) return false;
    // TODO: SELECT 1 via pg Pool
    return false;
  }

  info(): DbProviderInfo {
    const reachable = this.ping();
    return {
      provider: "postgres",
      reachable,
      detail: reachable
        ? undefined
        : "PostgreSQL driver not connected — set POSTGRES_* and install pg (Phase 201+)",
    };
  }
}

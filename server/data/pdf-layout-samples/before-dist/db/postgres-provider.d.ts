import type { DbProvider, DbProviderInfo } from "./db-provider.js";
/**
 * PostgreSQL provider — Phase 201-220 production infrastructure.
 */
export declare class PostgresProvider implements DbProvider {
    readonly type: "postgres";
    private cachedReachable;
    private cachedAt;
    sqlite(): null;
    ping(): boolean;
    pingAsync(): Promise<boolean>;
    info(): DbProviderInfo;
    statusDetail(): Promise<{
        version: string | null;
        migration: string | null;
        tableCount: number | null;
        reachable: boolean;
    }>;
}

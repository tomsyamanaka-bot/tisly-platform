import type Database from "better-sqlite3";
export type DbProviderType = "sqlite" | "postgres";
export interface DbProviderInfo {
    provider: DbProviderType;
    reachable: boolean;
    detail?: string;
}
export interface DbProvider {
    readonly type: DbProviderType;
    ping(): boolean;
    info(): DbProviderInfo;
    /** SQLite native handle — null when postgres-only mode */
    sqlite(): Database.Database | null;
}
export declare function getDbProvider(): DbProvider;
export declare function resetDbProviderForTests(): void;

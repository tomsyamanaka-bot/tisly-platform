import type Database from "better-sqlite3";
import type { DbProviderType } from "./db-provider.js";
export interface MigrationStatus {
    provider: DbProviderType;
    applied: string[];
    pending: string[];
    ok: boolean;
}
export declare function runSqliteMigrations(db?: Database.Database): MigrationStatus;
export declare function runPostgresMigrations(): Promise<MigrationStatus>;
export declare function runMigrationsForProvider(): MigrationStatus;
export declare function runMigrationsForProviderAsync(): Promise<MigrationStatus>;

import type Database from "better-sqlite3";
export interface MigrationVerifyResult {
    ok: boolean;
    sqliteCounts: Record<string, number>;
    postgresCounts: Record<string, number>;
    mismatches: string[];
}
export declare function countSqliteTables(db: Database.Database): Record<string, number>;
export declare function verifyMigration(db: Database.Database): Promise<MigrationVerifyResult>;

import type Database from "better-sqlite3";
export interface SqliteExportBundle {
    exportedAt: string;
    dbPath: string;
    tables: Record<string, unknown[]>;
}
export declare function exportSqliteData(db: Database.Database): SqliteExportBundle;
export declare function writeSqliteExport(db: Database.Database, outPath: string): SqliteExportBundle;

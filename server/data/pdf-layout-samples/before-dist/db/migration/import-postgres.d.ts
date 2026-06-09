import type pg from "pg";
import type { SqliteExportBundle } from "./export-sqlite.js";
export declare function importBundleToPostgres(bundle: SqliteExportBundle, client?: pg.PoolClient): Promise<{
    imported: Record<string, number>;
    errors: string[];
}>;

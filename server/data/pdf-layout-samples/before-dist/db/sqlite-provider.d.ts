import type Database from "better-sqlite3";
import type { DbProvider, DbProviderInfo } from "./db-provider.js";
export declare class SqliteProvider implements DbProvider {
    readonly type: "sqlite";
    private getDb;
    constructor(getDb: () => Database.Database);
    sqlite(): Database.Database;
    ping(): boolean;
    info(): DbProviderInfo;
}

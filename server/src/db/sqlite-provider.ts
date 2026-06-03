import type Database from "better-sqlite3";
import type { DbProvider, DbProviderInfo } from "./db-provider.js";

export class SqliteProvider implements DbProvider {
  readonly type = "sqlite" as const;
  private getDb: () => Database.Database;

  constructor(getDb: () => Database.Database) {
    this.getDb = getDb;
  }

  sqlite(): Database.Database {
    return this.getDb();
  }

  ping(): boolean {
    try {
      this.getDb().prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  info(): DbProviderInfo {
    return {
      provider: "sqlite",
      reachable: this.ping(),
    };
  }
}

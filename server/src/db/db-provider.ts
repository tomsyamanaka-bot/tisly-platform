import type Database from "better-sqlite3";
import { config } from "../config.js";
import { getDatabase } from "./database.js";
import { PostgresProvider } from "./postgres-provider.js";
import { SqliteProvider } from "./sqlite-provider.js";

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

let provider: DbProvider | null = null;

export function getDbProvider(): DbProvider {
  if (provider) return provider;
  provider =
    config.dbProvider === "postgres"
      ? new PostgresProvider()
      : new SqliteProvider(getDatabase);
  return provider;
}

export function resetDbProviderForTests(): void {
  provider = null;
}

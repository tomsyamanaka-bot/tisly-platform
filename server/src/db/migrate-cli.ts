#!/usr/bin/env tsx
/**
 * DB CLI — migrate / status / backup
 * SQLite 中心。PostgreSQL は placeholder（Phase 201+）。
 */
import fs from "fs";
import path from "path";
import { runBackup } from "../backup/backup-manager.js";
import { config } from "../config.js";
import { getDatabase, getDbPath } from "./database.js";
import { getDbProvider } from "./db-provider.js";
import { runMigrationsForProvider } from "./migration-runner.js";

const cmd = process.argv[2] ?? "status";

async function main(): Promise<void> {
  switch (cmd) {
    case "migrate": {
      const result = runMigrationsForProvider();
      console.log(JSON.stringify(result, null, 2));
      if (config.dbProvider === "postgres" && !result.ok) {
        console.error(
          "PostgreSQL migration not yet implemented — use DB_PROVIDER=sqlite or Phase 201+"
        );
        process.exit(1);
      }
      break;
    }
    case "status": {
      const provider = getDbProvider();
      const info = provider.info();
      let sqlitePath: string | null = null;
      let sqliteSize: number | null = null;
      if (info.provider === "sqlite") {
        sqlitePath = getDbPath();
        if (fs.existsSync(sqlitePath)) {
          sqliteSize = fs.statSync(sqlitePath).size;
        }
      }
      console.log(
        JSON.stringify(
          {
            provider: info.provider,
            reachable: info.reachable,
            detail: info.detail,
            sqlitePath,
            sqliteSizeBytes: sqliteSize,
            postgres: config.dbProvider === "postgres" ? config.postgres : undefined,
          },
          null,
          2
        )
      );
      break;
    }
    case "backup": {
      if (config.dbProvider !== "sqlite") {
        console.error("db:backup currently supports SQLite only — TODO PostgreSQL pg_dump");
        process.exit(1);
      }
      getDatabase();
      const result = await runBackup(["sqlite", "events", "settings"]);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}\nUsage: migrate-cli.ts [migrate|status|backup]`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

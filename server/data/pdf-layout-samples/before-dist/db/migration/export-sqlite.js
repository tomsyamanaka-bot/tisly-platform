import fs from "fs";
import path from "path";
import { config } from "../../config.js";
const EXPORT_TABLES = [
    "users",
    "devices",
    "tv_devices",
    "events",
    "audit_logs",
    "platform_settings",
    "admin_sessions",
    "totp_secrets",
    "device_credentials",
    "notification_logs",
    "notification_deliveries",
    "sites",
    "tenants",
];
export function exportSqliteData(db) {
    const tables = {};
    for (const table of EXPORT_TABLES) {
        try {
            const rows = db.prepare(`SELECT * FROM ${table}`).all();
            tables[table] = rows;
        }
        catch {
            tables[table] = [];
        }
    }
    return {
        exportedAt: new Date().toISOString(),
        dbPath: config.dbPath,
        tables,
    };
}
export function writeSqliteExport(db, outPath) {
    const bundle = exportSqliteData(db);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), "utf-8");
    return bundle;
}

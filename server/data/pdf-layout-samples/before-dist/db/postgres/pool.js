import pg from "pg";
import { config } from "../../config.js";
const { Pool } = pg;
let pool = null;
let lastConnectError = null;
export function getPostgresConnectionString() {
    const url = process.env.DATABASE_URL;
    if (url?.startsWith("postgres://") || url?.startsWith("postgresql://")) {
        return url;
    }
    const { host, port, database, user, password, ssl } = config.postgres;
    const encPass = password ? encodeURIComponent(password) : "";
    const auth = encPass ? `${user}:${encPass}@` : `${user}@`;
    const sslParam = ssl ? "?sslmode=require" : "";
    return `postgresql://${auth}${host}:${port}/${database}${sslParam}`;
}
export function getPgPool() {
    if (config.dbProvider !== "postgres")
        return null;
    if (!config.postgres.database)
        return null;
    if (!pool) {
        pool = new Pool({
            connectionString: getPostgresConnectionString(),
            max: 10,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
        });
        pool.on("error", (err) => {
            lastConnectError = err.message;
            console.error("[postgres] pool error:", err.message);
        });
    }
    return pool;
}
export async function pingPostgres() {
    const p = getPgPool();
    if (!p)
        return false;
    try {
        await p.query("SELECT 1");
        lastConnectError = null;
        return true;
    }
    catch (e) {
        lastConnectError = e instanceof Error ? e.message : String(e);
        return false;
    }
}
export function getPostgresLastError() {
    return lastConnectError;
}
export async function reconnectPostgres() {
    if (pool) {
        await pool.end().catch(() => undefined);
        pool = null;
    }
    return pingPostgres();
}
export async function closePostgresPool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
export function resetPostgresPoolForTests() {
    pool = null;
    lastConnectError = null;
}

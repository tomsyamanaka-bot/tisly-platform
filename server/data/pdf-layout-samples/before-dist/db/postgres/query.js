import { getPgPool } from "./pool.js";
export async function pgQuery(text, params) {
    const pool = getPgPool();
    if (!pool)
        throw new Error("PostgreSQL pool not available");
    return pool.query(text, params);
}
export async function pgQueryOne(text, params) {
    const result = await pgQuery(text, params);
    return result.rows[0] ?? null;
}

import { getPgPool } from "./pool.js";
export async function withTransaction(fn) {
    const pool = getPgPool();
    if (!pool)
        throw new Error("PostgreSQL pool not available");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
}

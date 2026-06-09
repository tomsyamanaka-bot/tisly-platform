import { withTransaction } from "../postgres/transaction.js";
import { pingPostgres } from "../postgres/pool.js";
/** Column name mapping SQLite → PostgreSQL where they differ */
const TABLE_SKIP = new Set();
function rowToInsert(table, row) {
    const cols = Object.keys(row).filter((k) => row[k] !== undefined);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})
    ON CONFLICT DO NOTHING`;
    return { sql, vals: cols.map((c) => row[c]) };
}
export async function importBundleToPostgres(bundle, client) {
    if (!(await pingPostgres())) {
        throw new Error("PostgreSQL not reachable");
    }
    const imported = {};
    const errors = [];
    const run = async (c) => {
        for (const [table, rows] of Object.entries(bundle.tables)) {
            if (TABLE_SKIP.has(table) || !Array.isArray(rows) || rows.length === 0) {
                imported[table] = 0;
                continue;
            }
            let count = 0;
            for (const row of rows) {
                try {
                    const { sql, vals } = rowToInsert(table, row);
                    const res = await c.query(sql, vals);
                    count += res.rowCount ?? 0;
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (!errors.includes(`${table}: ${msg}`))
                        errors.push(`${table}: ${msg}`);
                }
            }
            imported[table] = count;
        }
    };
    if (client) {
        await run(client);
    }
    else {
        await withTransaction(run);
    }
    return { imported, errors };
}

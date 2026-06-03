import type pg from "pg";
import { getPgPool } from "./pool.js";

export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getPgPool();
  if (!pool) throw new Error("PostgreSQL pool not available");
  return pool.query<T>(text, params);
}

export async function pgQueryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await pgQuery<T>(text, params);
  return result.rows[0] ?? null;
}

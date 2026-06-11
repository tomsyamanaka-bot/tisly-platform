import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { MaterialV1 } from "./field-ops-types.js";

function rowToMaterial(r: Record<string, unknown>): MaterialV1 {
  return {
    id: String(r.id),
    category: String(r.category),
    name: String(r.name),
    maker: r.maker != null ? String(r.maker) : null,
    model: r.model != null ? String(r.model) : null,
    unit: String(r.unit ?? "個"),
    cost: Number(r.cost ?? 0),
    stockQty: Number(r.stock_qty ?? 0),
    minStock: Number(r.min_stock ?? 0),
    supplier: r.supplier != null ? String(r.supplier) : null,
    memo: r.memo != null ? String(r.memo) : null,
    active: Number(r.active ?? 1) === 1,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listMaterialsV1(opts?: {
  category?: string;
  activeOnly?: boolean;
  q?: string;
}): MaterialV1[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.category) {
    clauses.push("category = ?");
    params.push(opts.category);
  }
  if (opts?.activeOnly !== false) {
    clauses.push("active = 1");
  }
  if (opts?.q) {
    clauses.push("(name LIKE ? OR model LIKE ? OR maker LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT * FROM materials ${where} ORDER BY category ASC, name ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToMaterial);
}

export function getMaterialV1(id: string): MaterialV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM materials WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToMaterial(row) : null;
}

export function createMaterialV1(input: {
  category: string;
  name: string;
  maker?: string | null;
  model?: string | null;
  unit?: string;
  cost?: number;
  stockQty?: number;
  minStock?: number;
  supplier?: string | null;
  memo?: string | null;
  active?: boolean;
}): MaterialV1 {
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO materials (
        id, category, name, maker, model, unit, cost, stock_qty, min_stock,
        supplier, memo, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.category,
      input.name,
      input.maker ?? null,
      input.model ?? null,
      input.unit ?? "個",
      input.cost ?? 0,
      input.stockQty ?? 0,
      input.minStock ?? 0,
      input.supplier ?? null,
      input.memo ?? null,
      input.active !== false ? 1 : 0,
      now,
      now
    );
  return getMaterialV1(id)!;
}

export function updateMaterialV1(
  id: string,
  patch: Partial<{
    category: string;
    name: string;
    maker: string | null;
    model: string | null;
    unit: string;
    cost: number;
    stockQty: number;
    minStock: number;
    supplier: string | null;
    memo: string | null;
    active: boolean;
  }>
): MaterialV1 | null {
  const existing = getMaterialV1(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE materials SET
        category = COALESCE(?, category),
        name = COALESCE(?, name),
        maker = COALESCE(?, maker),
        model = COALESCE(?, model),
        unit = COALESCE(?, unit),
        cost = COALESCE(?, cost),
        stock_qty = COALESCE(?, stock_qty),
        min_stock = COALESCE(?, min_stock),
        supplier = COALESCE(?, supplier),
        memo = COALESCE(?, memo),
        active = COALESCE(?, active),
        updated_at = ?
      WHERE id = ?`
    )
    .run(
      patch.category ?? null,
      patch.name ?? null,
      patch.maker !== undefined ? patch.maker : null,
      patch.model !== undefined ? patch.model : null,
      patch.unit ?? null,
      patch.cost ?? null,
      patch.stockQty ?? null,
      patch.minStock ?? null,
      patch.supplier !== undefined ? patch.supplier : null,
      patch.memo !== undefined ? patch.memo : null,
      patch.active !== undefined ? (patch.active ? 1 : 0) : null,
      now,
      id
    );
  return getMaterialV1(id);
}

export function adjustMaterialStockV1(id: string, delta: number): MaterialV1 | null {
  const existing = getMaterialV1(id);
  if (!existing) return null;
  const next = Math.max(0, existing.stockQty + delta);
  return updateMaterialV1(id, { stockQty: next });
}

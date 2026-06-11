import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getMaterialV1 } from "./materials-v1-store.js";
import type { ProjectRefV1, PurchaseLineStatus, PurchaseLineV1 } from "./field-ops-types.js";
import { aggregateNeedsFromTemplates, listProjectWorkTemplateIds } from "./work-templates-store.js";

function rowToLine(r: Record<string, unknown>, stockQty: number | null): PurchaseLineV1 {
  const qtyRequired = Number(r.qty_required ?? 0);
  const stock = stockQty ?? 0;
  const shortageQty = Math.max(0, qtyRequired - stock);
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    materialId: r.material_id != null ? String(r.material_id) : null,
    label: String(r.label),
    qtyRequired,
    qtyOrdered: Number(r.qty_ordered ?? 0),
    unit: r.unit != null ? String(r.unit) : null,
    status: String(r.status) as PurchaseLineStatus,
    supplier: r.supplier != null ? String(r.supplier) : null,
    stockQty,
    shortageQty,
    orderedAt: r.ordered_at != null ? String(r.ordered_at) : null,
    receivedAt: r.received_at != null ? String(r.received_at) : null,
    carriedAt: r.carried_at != null ? String(r.carried_at) : null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export function listPurchaseLinesV1(ref: ProjectRefV1): PurchaseLineV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM purchase_lines
       WHERE project_source = ? AND project_id = ?
       ORDER BY sort_order ASC, label ASC`
    )
    .all(ref.source, ref.projectId) as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const materialId = r.material_id != null ? String(r.material_id) : null;
    const mat = materialId ? getMaterialV1(materialId) : null;
    return rowToLine(r, mat?.stockQty ?? null);
  });
}

export function computeShortageQty(materialId: string | null, qtyRequired: number): {
  stockQty: number;
  shortageQty: number;
} {
  if (!materialId) return { stockQty: 0, shortageQty: qtyRequired };
  const mat = getMaterialV1(materialId);
  const stockQty = mat?.stockQty ?? 0;
  return { stockQty, shortageQty: Math.max(0, qtyRequired - stockQty) };
}

export function generatePurchaseLinesV1(ref: ProjectRefV1): PurchaseLineV1[] {
  const db = getDatabase();
  const templateIds = listProjectWorkTemplateIds(ref);
  const needs = aggregateNeedsFromTemplates(templateIds).filter((n) => n.itemType === "material");
  db.prepare(
    `DELETE FROM purchase_lines WHERE project_source = ? AND project_id = ? AND status = 'pending'`
  ).run(ref.source, ref.projectId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO purchase_lines (
      id, project_source, project_id, material_id, label, qty_required, qty_ordered,
      unit, status, supplier, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  );
  let order = 0;
  for (const n of needs) {
    const { shortageQty } = computeShortageQty(n.materialId, n.qty);
    if (shortageQty <= 0) continue;
    const mat = n.materialId ? getMaterialV1(n.materialId) : null;
    insert.run(
      uuid(),
      ref.source,
      ref.projectId,
      n.materialId,
      n.label,
      n.qty,
      shortageQty,
      n.unit,
      mat?.supplier ?? null,
      order++,
      now,
      now
    );
  }
  return listPurchaseLinesV1(ref);
}

export function updatePurchaseLineStatusV1(
  lineId: string,
  status: PurchaseLineStatus
): PurchaseLineV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM purchase_lines WHERE id = ?`)
    .get(lineId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const now = new Date().toISOString();
  const orderedAt = status === "ordered" || status === "received" || status === "carried"
    ? row.ordered_at ?? now
    : null;
  const receivedAt =
    status === "received" || status === "carried" ? row.received_at ?? now : row.received_at ?? null;
  const carriedAt = status === "carried" ? now : row.carried_at ?? null;

  getDatabase()
    .prepare(
      `UPDATE purchase_lines SET
        status = ?,
        ordered_at = COALESCE(ordered_at, ?),
        received_at = ?,
        carried_at = ?,
        updated_at = ?
      WHERE id = ?`
    )
    .run(status, orderedAt, receivedAt, carriedAt, now, lineId);

  if (status === "received" && row.material_id) {
    const qty = Number(row.qty_ordered ?? row.qty_required ?? 0);
    const mat = getMaterialV1(String(row.material_id));
    if (mat) {
      getDatabase()
        .prepare(`UPDATE materials SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?`)
        .run(qty, now, row.material_id);
    }
  }
  if (status === "carried" && row.material_id) {
    const qty = Number(row.qty_ordered ?? row.qty_required ?? 0);
    getDatabase()
      .prepare(
        `UPDATE materials SET
          stock_qty = CASE WHEN stock_qty - ? < 0 THEN 0 ELSE stock_qty - ? END,
          updated_at = ?
        WHERE id = ?`
      )
      .run(qty, qty, now, row.material_id);
  }

  const updated = getDatabase()
    .prepare(`SELECT * FROM purchase_lines WHERE id = ?`)
    .get(lineId) as Record<string, unknown>;
  const materialId = updated.material_id != null ? String(updated.material_id) : null;
  const mat = materialId ? getMaterialV1(materialId) : null;
  return rowToLine(updated, mat?.stockQty ?? null);
}

export function summarizePurchaseV1(ref: ProjectRefV1): {
  pending: number;
  ordered: number;
  received: number;
  carried: number;
  total: number;
} {
  const lines = listPurchaseLinesV1(ref);
  return {
    pending: lines.filter((l) => l.status === "pending").length,
    ordered: lines.filter((l) => l.status === "ordered").length,
    received: lines.filter((l) => l.status === "received").length,
    carried: lines.filter((l) => l.status === "carried").length,
    total: lines.length,
  };
}

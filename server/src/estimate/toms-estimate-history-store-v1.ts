/**
 * TOMS 見積履歴ストア v1。
 * ワンタップ保存・一覧・複製（再利用）用。
 * 既存 business_estimates は触らない。
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { EstimateLineItem } from "../business/business-types.js";
import { calcTotals } from "../business/estimate-math.js";

export const TOMS_ESTIMATE_HISTORY_V1_SCHEMA = 1 as const;

export interface TomsEstimateHistoryItemV1 {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  category?: string;
  memo?: string;
}

export interface TomsEstimateHistoryRecordV1 {
  id: string;
  customerName: string;
  subject: string;
  workLocation: string;
  notes: string;
  items: TomsEstimateHistoryItemV1[];
  subtotal: number;
  tax: number;
  total: number;
  sourceProjectId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TomsEstimateHistorySaveInputV1 {
  customerName?: string;
  subject?: string;
  workLocation?: string;
  notes?: string;
  items: Array<Partial<TomsEstimateHistoryItemV1> & { name?: string }>;
  sourceProjectId?: string | null;
  createdBy?: string | null;
}

type HistoryRow = {
  id: string;
  customer_name: string;
  subject: string;
  work_location: string;
  notes: string;
  items_json: string;
  subtotal: number;
  tax: number;
  total: number;
  source_project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeHistoryItemsV1(
  raw: Array<Partial<TomsEstimateHistoryItemV1> & { name?: string }>
): TomsEstimateHistoryItemV1[] {
  const out: TomsEstimateHistoryItemV1[] = [];
  for (const it of raw || []) {
    const name = String(it.name || "").trim();
    if (!name) continue;
    const quantity = Math.max(0.01, Number(it.quantity) || 1);
    const unitPrice = Math.max(0, Math.round(Number(it.unitPrice) || 0));
    const amount =
      it.amount != null
        ? Math.round(Number(it.amount) || 0)
        : Math.round(quantity * unitPrice);
    out.push({
      name,
      unit: String(it.unit || "式"),
      quantity,
      unitPrice,
      amount,
      category: String(it.category || "other"),
      memo: String(it.memo || ""),
    });
  }
  return out;
}

function rowToRecord(row: HistoryRow): TomsEstimateHistoryRecordV1 {
  let items: TomsEstimateHistoryItemV1[] = [];
  try {
    const parsed = JSON.parse(row.items_json || "[]");
    items = normalizeHistoryItemsV1(Array.isArray(parsed) ? parsed : []);
  } catch {
    items = [];
  }
  return {
    id: row.id,
    customerName: row.customer_name || "",
    subject: row.subject || "",
    workLocation: row.work_location || "",
    notes: row.notes || "",
    items,
    subtotal: Number(row.subtotal) || 0,
    tax: Number(row.tax) || 0,
    total: Number(row.total) || 0,
    sourceProjectId: row.source_project_id || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 見積スナップショットを履歴へ保存。
 */
export function saveTomsEstimateHistoryV1(
  input: TomsEstimateHistorySaveInputV1
): TomsEstimateHistoryRecordV1 {
  const items = normalizeHistoryItemsV1(input.items || []);
  if (!items.length) {
    throw new Error("items required");
  }
  const lineItems = items.map(
    (it) =>
      ({
        id: uuid(),
        category: it.category || "other",
        name: it.name,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
        memo: it.memo || "",
      }) satisfies EstimateLineItem
  );
  const totals = calcTotals(lineItems);
  const id = `TEH-${uuid().slice(0, 10).toUpperCase()}`;
  const now = new Date().toISOString();
  const customerName = String(input.customerName || "").trim() || "（無名）";
  const subject = String(input.subject || "").trim();
  const workLocation = String(input.workLocation || "").trim();
  const notes = String(input.notes || "").trim();
  const sourceProjectId = input.sourceProjectId
    ? String(input.sourceProjectId)
    : null;
  const createdBy = input.createdBy ? String(input.createdBy) : null;

  getDatabase()
    .prepare(
      `INSERT INTO toms_estimate_history_v1 (
        id, customer_name, subject, work_location, notes, items_json,
        subtotal, tax, total, source_project_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      customerName,
      subject,
      workLocation,
      notes,
      JSON.stringify(items),
      totals.subtotal,
      totals.tax,
      totals.total,
      sourceProjectId,
      createdBy,
      now,
      now
    );

  return getTomsEstimateHistoryByIdV1(id)!;
}

export function listTomsEstimateHistoryV1(opts?: {
  limit?: number;
}): TomsEstimateHistoryRecordV1[] {
  const limit = Math.min(200, Math.max(1, Number(opts?.limit) || 50));
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM toms_estimate_history_v1
       ORDER BY datetime(created_at) DESC
       LIMIT ?`
    )
    .all(limit) as HistoryRow[];
  return rows.map(rowToRecord);
}

export function getTomsEstimateHistoryByIdV1(
  id: string
): TomsEstimateHistoryRecordV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM toms_estimate_history_v1 WHERE id = ?`)
    .get(String(id)) as HistoryRow | undefined;
  return row ? rowToRecord(row) : null;
}

/**
 * 履歴を複製して新規履歴として保存（再利用）。
 * 明細はそのままコピー。
 */
export function duplicateTomsEstimateHistoryV1(
  id: string,
  opts?: { createdBy?: string | null }
): TomsEstimateHistoryRecordV1 {
  const src = getTomsEstimateHistoryByIdV1(id);
  if (!src) throw new Error("history not found");
  return saveTomsEstimateHistoryV1({
    customerName: src.customerName,
    subject: src.subject ? `${src.subject}（複製）` : "（複製）",
    workLocation: src.workLocation,
    notes: src.notes,
    items: src.items,
    sourceProjectId: src.sourceProjectId,
    createdBy: opts?.createdBy ?? src.createdBy,
  });
}

export function deleteTomsEstimateHistoryV1(id: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM toms_estimate_history_v1 WHERE id = ?`)
    .run(String(id));
  return r.changes > 0;
}

/**
 * LINE 共有用の見積テキストを生成。
 */
export function buildTomsEstimateLineShareTextV1(input: {
  customerName?: string;
  subject?: string;
  items: TomsEstimateHistoryItemV1[];
  subtotal?: number;
  tax?: number;
  total?: number;
}): string {
  const items = normalizeHistoryItemsV1(input.items || []);
  const lineItems = items.map(
    (it) =>
      ({
        id: "x",
        category: it.category || "other",
        name: it.name,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
      }) satisfies EstimateLineItem
  );
  const totals = calcTotals(lineItems);
  const customer = String(input.customerName || "").trim() || "お客様";
  const subject = String(input.subject || "").trim() || "お見積り";
  const lines = [
    `【TOMS お見積り】`,
    `宛名: ${customer}`,
    `件名: ${subject}`,
    ``,
    `■明細`,
    ...items.map(
      (it, i) =>
        `${i + 1}. ${it.name} ${it.quantity}${it.unit} × ¥${it.unitPrice.toLocaleString("ja-JP")} = ¥${it.amount.toLocaleString("ja-JP")}`
    ),
    ``,
    `小計: ¥${(input.subtotal ?? totals.subtotal).toLocaleString("ja-JP")}`,
    `消費税: ¥${(input.tax ?? totals.tax).toLocaleString("ja-JP")}`,
    `税込合計: ¥${(input.total ?? totals.total).toLocaleString("ja-JP")}`,
    ``,
    `株式会社TOMS`,
  ];
  return lines.join("\n");
}

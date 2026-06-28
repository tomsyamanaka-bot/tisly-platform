import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { createBusinessProject } from "../business/business-store.js";
import { ensureBusinessCustomer } from "../business/customer-price-rules.js";
import { todayInTimeZone } from "../services/googleCalendar.js";
import type { FieldCheckItemV1, FieldCheckSessionV1, ProjectRefV1 } from "./field-ops-types.js";

function isDemoTitle(title: string): boolean {
  return /DEMO|デモ/i.test(title);
}

function normalizeCheckDate(raw?: string | null): string {
  const d = String(raw ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return todayInTimeZone();
}

function rowToItem(
  r: Record<string, unknown>,
  dayState?: Record<string, unknown> | null
): FieldCheckItemV1 {
  const checkedFromDay = dayState != null ? Number(dayState.checked ?? 0) === 1 : false;
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    label: String(r.label),
    category: String(r.category ?? ""),
    quantity: Number(r.quantity ?? 1),
    unit: r.unit != null ? String(r.unit) : null,
    materialId: r.material_id != null ? String(r.material_id) : null,
    source: String(r.source) === "manual" ? "manual" : "auto",
    syncKey: r.sync_key != null ? String(r.sync_key) : null,
    checked: checkedFromDay,
    checkedAt: dayState?.checked_at != null ? String(dayState.checked_at) : null,
    checkedBy: dayState?.checked_by != null ? String(dayState.checked_by) : null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function rowToSession(r: Record<string, unknown>): FieldCheckSessionV1 {
  return {
    id: String(r.id),
    projectSource: String(r.project_source) as ProjectRefV1["source"],
    projectId: String(r.project_id),
    checkedCount: Number(r.checked_count ?? 0),
    totalCount: Number(r.total_count ?? 0),
    allChecked: Number(r.all_checked ?? 0) === 1,
    completedBy: r.completed_by != null ? String(r.completed_by) : null,
    completedAt: String(r.completed_at),
    memo: r.memo != null ? String(r.memo) : null,
  };
}

function loadDayStatesForItems(
  itemIds: string[],
  checkDate: string
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!itemIds.length) return map;
  const db = getDatabase();
  const placeholders = itemIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM field_check_item_day_states
       WHERE check_date = ? AND item_id IN (${placeholders})`
    )
    .all(checkDate, ...itemIds) as Array<Record<string, unknown>>;
  for (const row of rows) {
    map.set(String(row.item_id), row);
  }
  return map;
}

function sortMaterialItems(items: FieldCheckItemV1[]): FieldCheckItemV1[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label, "ja");
  });
}

export function getFieldCheckProgressV1(
  ref: ProjectRefV1,
  checkDate?: string
): { checked: number; total: number } {
  const items = listFieldCheckItemsV1(ref, checkDate);
  return {
    checked: items.filter((i) => i.checked).length,
    total: items.length,
  };
}

export function listFieldCheckItemsV1(ref: ProjectRefV1, checkDate?: string): FieldCheckItemV1[] {
  const date = normalizeCheckDate(checkDate);
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM field_check_items
       WHERE project_source = ? AND project_id = ?
       ORDER BY sort_order ASC, label ASC`
    )
    .all(ref.source, ref.projectId) as Array<Record<string, unknown>>;
  const dayStates = loadDayStatesForItems(
    rows.map((r) => String(r.id)),
    date
  );
  const items = rows.map((r) => rowToItem(r, dayStates.get(String(r.id)) ?? null));
  return sortMaterialItems(items);
}

/** 工事テンプレからの自動生成は廃止（材料は手動入力） */
export function generateFieldCheckItemsV1(ref: ProjectRefV1): FieldCheckItemV1[] {
  return listFieldCheckItemsV1(ref);
}

export function addManualFieldCheckItemV1(
  ref: ProjectRefV1,
  input: { label: string; quantity?: number; unit?: string; category?: string }
): FieldCheckItemV1 {
  const id = uuid();
  const now = new Date().toISOString();
  const maxOrder = getDatabase()
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM field_check_items
       WHERE project_source = ? AND project_id = ?`
    )
    .get(ref.source, ref.projectId) as { n: number };
  getDatabase()
    .prepare(
      `INSERT INTO field_check_items (
        id, project_source, project_id, label, category, quantity, unit,
        material_id, source, checked, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'manual', 0, ?, ?, ?)`
    )
    .run(
      id,
      ref.source,
      ref.projectId,
      input.label.trim(),
      input.category ?? "材料",
      input.quantity ?? 1,
      input.unit ?? null,
      maxOrder.n,
      now,
      now
    );
  return listFieldCheckItemsV1(ref).find((i) => i.id === id)!;
}

function upsertDayCheckState(
  itemId: string,
  checkDate: string,
  checked: boolean,
  checkedBy: string | null
): void {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO field_check_item_day_states (item_id, check_date, checked, checked_at, checked_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, check_date) DO UPDATE SET
         checked = excluded.checked,
         checked_at = excluded.checked_at,
         checked_by = excluded.checked_by`
    )
    .run(itemId, checkDate, checked ? 1 : 0, checked ? now : null, checked ? checkedBy : null);
}

export function updateFieldCheckItemV1(
  itemId: string,
  patch: { checked?: boolean; checkedBy?: string | null; label?: string; quantity?: number },
  checkDate?: string
): FieldCheckItemV1 | null {
  const now = new Date().toISOString();
  const row = getDatabase()
    .prepare(`SELECT * FROM field_check_items WHERE id = ?`)
    .get(itemId) as Record<string, unknown> | undefined;
  if (!row) return null;

  if (patch.label != null || patch.quantity != null) {
    getDatabase()
      .prepare(
        `UPDATE field_check_items SET
          label = COALESCE(?, label),
          quantity = COALESCE(?, quantity),
          updated_at = ?
        WHERE id = ?`
      )
      .run(patch.label ?? null, patch.quantity ?? null, now, itemId);
  }

  if (patch.checked !== undefined) {
    const date = normalizeCheckDate(checkDate);
    const checkedBy =
      patch.checkedBy !== undefined
        ? patch.checkedBy
        : patch.checked
          ? "user"
          : null;
    upsertDayCheckState(itemId, date, patch.checked, checkedBy);
  }

  const ref: ProjectRefV1 = {
    source: String(row.project_source) as ProjectRefV1["source"],
    projectId: String(row.project_id),
  };
  return listFieldCheckItemsV1(ref, checkDate).find((i) => i.id === itemId) ?? null;
}

export function deleteFieldCheckItemV1(itemId: string): boolean {
  const result = getDatabase().prepare(`DELETE FROM field_check_items WHERE id = ?`).run(itemId);
  return result.changes > 0;
}

export function completeFieldCheckSessionV1(
  ref: ProjectRefV1,
  completedBy: string | null,
  memo?: string | null,
  checkDate?: string
): FieldCheckSessionV1 {
  const items = listFieldCheckItemsV1(ref, checkDate);
  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;
  const allChecked = totalCount > 0 && checkedCount === totalCount;
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO field_check_sessions (
        id, project_source, project_id, checked_count, total_count,
        all_checked, completed_by, completed_at, memo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      ref.source,
      ref.projectId,
      checkedCount,
      totalCount,
      allChecked ? 1 : 0,
      completedBy,
      now,
      memo ?? null
    );
  return rowToSession(
    getDatabase().prepare(`SELECT * FROM field_check_sessions WHERE id = ?`).get(id) as Record<string, unknown>
  );
}

export function listFieldCheckSessionsV1(ref: ProjectRefV1): FieldCheckSessionV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM field_check_sessions
       WHERE project_source = ? AND project_id = ?
       ORDER BY completed_at DESC`
    )
    .all(ref.source, ref.projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToSession);
}

export interface FieldCheckProjectListItemV1 {
  id: string;
  source: ProjectRefV1["source"];
  title: string;
  projectNo: string;
  customerName: string;
  eventDate: string | null;
  checked: number;
  total: number;
}

function rowToFieldCheckProjectListItem(
  source: ProjectRefV1["source"],
  r: Record<string, unknown>
): FieldCheckProjectListItemV1 {
  const ref: ProjectRefV1 = { source, projectId: String(r.id) };
  const progress = getFieldCheckProgressV1(ref);
  const eventDateRaw = r.event_date ? String(r.event_date).slice(0, 10) : "";
  const eventDate =
    eventDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw) ? eventDateRaw : null;
  return {
    id: ref.projectId,
    source: ref.source,
    title: String(r.title || "案件"),
    projectNo: String(r.project_no || ref.projectId),
    customerName: String(r.customer_name || ""),
    eventDate,
    checked: progress.checked,
    total: progress.total,
  };
}

function mergeProjectRow(
  deduped: Map<string, Record<string, unknown>>,
  source: ProjectRefV1["source"],
  r: Record<string, unknown>
): void {
  const key = `${source}:${r.id}`;
  const title = String(r.title ?? "").trim();
  if (isDemoTitle(title)) return;
  const eventDateRaw = r.event_date ? String(r.event_date).slice(0, 10) : "";
  const eventDate =
    eventDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw) ? eventDateRaw : null;
  const prev = deduped.get(key);
  if (!prev) {
    deduped.set(key, { ...r, source, title, event_date: eventDate ?? "" });
    return;
  }
  const prevTitle = String(prev.title ?? "").trim();
  const prevDate = String(prev.event_date ?? "").slice(0, 10);
  const score = (t: string, d: string) =>
    (t && t !== "案件" ? 100 : 0) + (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? 10 : 0) + t.length;
  if (score(title, eventDate ?? "") >= score(prevTitle, prevDate)) {
    deduped.set(key, { ...r, source, title, event_date: eventDate ?? "" });
  }
}

/** 材料チェック PWA 一覧 — カレンダー連携・現調・見積案件を統合 */
export function listFieldCheckProjectsV1(opts?: { limit?: number }): FieldCheckProjectListItemV1[] {
  const limit = opts?.limit ?? 80;
  const db = getDatabase();
  const deduped = new Map<string, Record<string, unknown>>();

  const calendarRows = db
    .prepare(
      `SELECT DISTINCT
         l.project_source AS source,
         l.project_id AS id,
         COALESCE(
           NULLIF(sp.site_name, ''),
           NULLIF(sp.customer_name, ''),
           NULLIF(bp.title, ''),
           NULLIF(se.title, ''),
           NULLIF(se2.title, '')
         ) AS title,
         COALESCE(sp.project_no, bp.project_no, l.project_id) AS project_no,
         COALESCE(sp.customer_name, bp.customer_name, '') AS customer_name,
         COALESCE(
           NULLIF(sp.survey_date, ''),
           NULLIF(se.event_date, ''),
           NULLIF(se2.event_date, '')
         ) AS event_date
       FROM google_calendar_event_links l
       LEFT JOIN survey_projects sp
         ON l.project_source = 'survey' AND l.project_id = sp.project_id
       LEFT JOIN business_projects bp
         ON l.project_source = 'business' AND l.project_id = bp.id
       LEFT JOIN schedule_calendar_events se
         ON l.schedule_event_id IS NOT NULL AND l.schedule_event_id = se.id
       LEFT JOIN schedule_calendar_events se2
         ON se2.external_id = l.google_event_id
       WHERE (sp.project_id IS NULL OR sp.status NOT IN ('archived', 'deleted'))
       ORDER BY event_date DESC, title ASC
       LIMIT ?`
    )
    .all(limit * 3) as Array<Record<string, unknown>>;
  for (const r of calendarRows) {
    mergeProjectRow(deduped, String(r.source) as ProjectRefV1["source"], r);
  }

  const surveyRows = db
    .prepare(
      `SELECT sp.project_id AS id,
         COALESCE(NULLIF(sp.site_name, ''), NULLIF(sp.customer_name, ''), sp.project_id) AS title,
         COALESCE(sp.project_no, sp.project_id) AS project_no,
         COALESCE(sp.customer_name, '') AS customer_name,
         NULLIF(sp.survey_date, '') AS event_date
       FROM survey_projects sp
       WHERE sp.status NOT IN ('archived', 'deleted')
       ORDER BY sp.survey_date DESC, sp.updated_at DESC
       LIMIT ?`
    )
    .all(limit * 2) as Array<Record<string, unknown>>;
  for (const r of surveyRows) {
    mergeProjectRow(deduped, "survey", r);
  }

  const businessRows = db
    .prepare(
      `SELECT bp.id AS id,
         COALESCE(NULLIF(bp.title, ''), NULLIF(bp.customer_name, ''), bp.id) AS title,
         COALESCE(bp.project_no, bp.id) AS project_no,
         COALESCE(bp.customer_name, '') AS customer_name,
         NULL AS event_date
       FROM business_projects bp
       WHERE bp.status NOT IN ('archived', 'deleted')
       ORDER BY bp.updated_at DESC
       LIMIT ?`
    )
    .all(limit * 2) as Array<Record<string, unknown>>;
  for (const r of businessRows) {
    mergeProjectRow(deduped, "business", r);
  }

  return [...deduped.values()]
    .sort((a, b) => {
      const da = String(a.event_date ?? "");
      const dbDate = String(b.event_date ?? "");
      if (da !== dbDate) return dbDate.localeCompare(da);
      return String(a.title ?? "").localeCompare(String(b.title ?? ""), "ja");
    })
    .slice(0, limit)
    .map((r) =>
      rowToFieldCheckProjectListItem(String(r.source) as ProjectRefV1["source"], r)
    );
}

export function createFieldCheckProjectV1(input: {
  title: string;
  customerName?: string;
}): FieldCheckProjectListItemV1 {
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  const customerName = (input.customerName ?? title).trim() || title;
  const customerId = `BCU-FC-${uuid().slice(0, 8).toUpperCase()}`;
  ensureBusinessCustomer({ id: customerId, name: customerName, type: "company" });
  const project = createBusinessProject({
    customerId,
    customerName,
    title,
  });
  return rowToFieldCheckProjectListItem("business", {
    id: project.id,
    title: project.title,
    project_no: project.projectNo,
    customer_name: project.customerName,
    event_date: todayInTimeZone(),
  });
}

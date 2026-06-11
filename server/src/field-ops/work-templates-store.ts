import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { ProjectRefV1, WorkTemplateItemV1, WorkTemplateV1 } from "./field-ops-types.js";

function rowToItem(r: Record<string, unknown>): WorkTemplateItemV1 {
  return {
    id: String(r.id),
    templateId: String(r.template_id),
    materialId: r.material_id != null ? String(r.material_id) : null,
    label: String(r.label),
    qty: Number(r.qty ?? 1),
    unit: r.unit != null ? String(r.unit) : null,
    itemType: String(r.item_type) === "tool" ? "tool" : "material",
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function listItemsForTemplate(templateId: string): WorkTemplateItemV1[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM work_template_items WHERE template_id = ? ORDER BY sort_order ASC, label ASC`
    )
    .all(templateId) as Array<Record<string, unknown>>;
  return rows.map(rowToItem);
}

function rowToTemplate(r: Record<string, unknown>, withItems: boolean): WorkTemplateV1 {
  const id = String(r.id);
  return {
    id,
    name: String(r.name),
    description: r.description != null ? String(r.description) : null,
    active: Number(r.active ?? 1) === 1,
    sortOrder: Number(r.sort_order ?? 0),
    items: withItems ? listItemsForTemplate(id) : [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listWorkTemplatesV1(activeOnly = true): WorkTemplateV1[] {
  const db = getDatabase();
  const where = activeOnly ? "WHERE active = 1" : "";
  const rows = db
    .prepare(`SELECT * FROM work_templates ${where} ORDER BY sort_order ASC, name ASC`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => rowToTemplate(r, true));
}

export function getWorkTemplateV1(id: string): WorkTemplateV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM work_templates WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToTemplate(row, true) : null;
}

export function listProjectWorkTemplateIds(ref: ProjectRefV1): string[] {
  const rows = getDatabase()
    .prepare(
      `SELECT template_id FROM project_work_templates
       WHERE project_source = ? AND project_id = ?`
    )
    .all(ref.source, ref.projectId) as Array<{ template_id: string }>;
  return rows.map((r) => String(r.template_id));
}

export function setProjectWorkTemplates(ref: ProjectRefV1, templateIds: string[]): string[] {
  const db = getDatabase();
  const now = new Date().toISOString();
  const unique = [...new Set(templateIds.filter(Boolean))];
  db.prepare(
    `DELETE FROM project_work_templates WHERE project_source = ? AND project_id = ?`
  ).run(ref.source, ref.projectId);
  const insert = db.prepare(
    `INSERT INTO project_work_templates (id, project_source, project_id, template_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const templateId of unique) {
    insert.run(uuid(), ref.source, ref.projectId, templateId, now);
  }
  return unique;
}

export interface AggregatedNeedV1 {
  materialId: string | null;
  label: string;
  unit: string | null;
  itemType: "material" | "tool";
  qty: number;
  category: string | null;
}

export function aggregateNeedsFromTemplates(templateIds: string[]): AggregatedNeedV1[] {
  if (!templateIds.length) return [];
  const db = getDatabase();
  const placeholders = templateIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT wti.*, m.category as material_category, m.unit as material_unit, m.name as material_name
       FROM work_template_items wti
       LEFT JOIN materials m ON m.id = wti.material_id
       WHERE wti.template_id IN (${placeholders})`
    )
    .all(...templateIds) as Array<Record<string, unknown>>;

  const map = new Map<string, AggregatedNeedV1>();
  for (const r of rows) {
    const materialId = r.material_id != null ? String(r.material_id) : null;
    const itemType = String(r.item_type) === "tool" ? "tool" : "material";
    const label = String(r.label || r.material_name || "項目");
    const unit = r.unit != null ? String(r.unit) : r.material_unit != null ? String(r.material_unit) : null;
    const key = materialId ? `m:${materialId}` : `t:${label}`;
    const qty = Number(r.qty ?? 1);
    const existing = map.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      map.set(key, {
        materialId,
        label,
        unit,
        itemType,
        qty,
        category: r.material_category != null ? String(r.material_category) : itemType === "tool" ? "工具" : null,
      });
    }
  }
  return [...map.values()];
}

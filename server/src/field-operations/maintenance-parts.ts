import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";

export interface MaintenanceReplacementPart {
  partId: string;
  reportId: string;
  customerCode: string;
  partName: string;
  quantity: number;
  unit: string;
  notes: string | null;
  createdAt: string;
}

export function addMaintenanceReplacementParts(input: {
  reportId: string;
  customerCode: string;
  parts: Array<{ partName: string; quantity?: number; unit?: string; notes?: string }>;
}): MaintenanceReplacementPart[] {
  if (!getCustomerByCode(input.customerCode)) throw new Error("customer not found");
  const db = getDatabase();
  const report = db
    .prepare(`SELECT report_id FROM maintenance_reports WHERE report_id = ?`)
    .get(input.reportId);
  if (!report) throw new Error("report not found");

  const created: MaintenanceReplacementPart[] = [];
  for (const p of input.parts) {
    const partId = `MPT-${uuid().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO maintenance_replacement_parts
       (part_id, report_id, customer_code, part_name, quantity, unit, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      partId,
      input.reportId,
      input.customerCode.toUpperCase(),
      p.partName,
      p.quantity ?? 1,
      p.unit ?? "個",
      p.notes ?? null,
      now
    );
    created.push({
      partId,
      reportId: input.reportId,
      customerCode: input.customerCode.toUpperCase(),
      partName: p.partName,
      quantity: p.quantity ?? 1,
      unit: p.unit ?? "個",
      notes: p.notes ?? null,
      createdAt: now,
    });
  }
  return created;
}

export function listMaintenanceReplacementParts(reportId: string): MaintenanceReplacementPart[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM maintenance_replacement_parts WHERE report_id = ? ORDER BY created_at ASC`
    )
    .all(reportId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    partId: String(r.part_id),
    reportId: String(r.report_id),
    customerCode: String(r.customer_code),
    partName: String(r.part_name),
    quantity: Number(r.quantity),
    unit: String(r.unit),
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: String(r.created_at),
  }));
}

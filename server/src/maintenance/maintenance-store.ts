import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";

export interface MaintenanceCase {
  caseId: string;
  customerCode: string;
  siteId: string | null;
  siteName: string | null;
  deviceIds: string[];
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToCase(r: Record<string, unknown>): MaintenanceCase {
  let deviceIds: string[] = [];
  try {
    deviceIds = JSON.parse(String(r.device_ids_json ?? "[]")) as string[];
  } catch {
    deviceIds = [];
  }
  return {
    caseId: String(r.case_id),
    customerCode: String(r.customer_code),
    siteId: r.site_id != null ? String(r.site_id) : null,
    siteName: r.site_name != null ? String(r.site_name) : null,
    deviceIds,
    status: String(r.status),
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function createMaintenanceCase(input: {
  customerCode: string;
  siteId?: string;
  siteName?: string;
  deviceIds?: string[];
  notes?: string;
  status?: string;
}): MaintenanceCase {
  const caseId = `MNT-${uuid().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const deviceIds = input.deviceIds ?? [];
  getDatabase()
    .prepare(
      `INSERT INTO maintenance_cases (case_id, customer_code, site_id, site_name, device_ids_json, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      caseId,
      input.customerCode.toUpperCase(),
      input.siteId ?? null,
      input.siteName ?? null,
      JSON.stringify(deviceIds),
      input.status ?? "open",
      input.notes ?? null,
      now,
      now
    );
  return getMaintenanceCase(caseId)!;
}

export function getMaintenanceCase(caseId: string): MaintenanceCase | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM maintenance_cases WHERE case_id = ?`)
    .get(caseId) as Record<string, unknown> | undefined;
  return row ? rowToCase(row) : null;
}

export function listMaintenanceCases(customerCode?: string): MaintenanceCase[] {
  const rows = customerCode
    ? (getDatabase()
        .prepare(`SELECT * FROM maintenance_cases WHERE customer_code = ? ORDER BY updated_at DESC`)
        .all(customerCode.toUpperCase()) as Record<string, unknown>[])
    : (getDatabase()
        .prepare(`SELECT * FROM maintenance_cases ORDER BY updated_at DESC`)
        .all() as Record<string, unknown>[]);
  return rows.map(rowToCase);
}

export function updateMaintenanceCase(
  caseId: string,
  patch: Partial<{ siteId: string; siteName: string; deviceIds: string[]; status: string; notes: string }>
): MaintenanceCase | null {
  const existing = getMaintenanceCase(caseId);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE maintenance_cases SET site_id = ?, site_name = ?, device_ids_json = ?, status = ?, notes = ?, updated_at = ?
       WHERE case_id = ?`
    )
    .run(
      patch.siteId !== undefined ? patch.siteId : existing.siteId,
      patch.siteName !== undefined ? patch.siteName : existing.siteName,
      JSON.stringify(patch.deviceIds ?? existing.deviceIds),
      patch.status ?? existing.status,
      patch.notes !== undefined ? patch.notes : existing.notes,
      now,
      caseId
    );
  return getMaintenanceCase(caseId);
}

export function deleteMaintenanceCase(caseId: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM maintenance_cases WHERE case_id = ?`).run(caseId);
  return r.changes > 0;
}

export interface RecoveryHistoryEntry {
  id: string;
  deviceId: string;
  status: string;
  success: boolean;
  actor: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function listRecoveryHistoryForCustomer(customerCode: string, limit = 50): RecoveryHistoryEntry[] {
  const customer = getCustomerByCode(customerCode);
  if (!customer) return [];
  const rows = getDatabase()
    .prepare(
      `SELECT r.id, r.device_id, r.status, r.started_at, r.completed_at, r.steps_json
       FROM recovery_runs r
       INNER JOIN devices d ON d.device_id = r.device_id
       WHERE d.customer_id = ?
       ORDER BY r.started_at DESC
       LIMIT ?`
    )
    .all(customer.customer_id, limit) as Array<{
    id: string;
    device_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    steps_json: string | null;
  }>;
  return rows.map((r) => {
    let actor: string | null = null;
    if (r.steps_json) {
      try {
        const steps = JSON.parse(r.steps_json) as Array<{ actor?: string }>;
        actor = steps.find((s) => s.actor)?.actor ?? null;
      } catch {
        actor = null;
      }
    }
    const success = r.status === "completed";
    return {
      id: r.id,
      deviceId: r.device_id,
      status: r.status,
      success,
      actor,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  });
}

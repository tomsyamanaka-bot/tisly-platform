import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";

export interface MaintenanceInspectionNote {
  customerCode: string;
  memo: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function getMaintenanceInspectionNote(customerCode: string): MaintenanceInspectionNote {
  const code = customerCode.toUpperCase();
  const row = getDatabase()
    .prepare(
      `SELECT customer_code, memo, updated_at, updated_by FROM maintenance_inspection_notes WHERE customer_code = ?`
    )
    .get(code) as
    | { customer_code: string; memo: string; updated_at: string; updated_by: string | null }
    | undefined;
  return {
    customerCode: code,
    memo: row?.memo ?? "",
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}

export function saveMaintenanceInspectionNote(input: {
  customerCode: string;
  memo: string;
  updatedBy?: string;
}): MaintenanceInspectionNote {
  if (!getCustomerByCode(input.customerCode)) throw new Error("customer not found");
  const code = input.customerCode.toUpperCase();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO maintenance_inspection_notes (customer_code, memo, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(customer_code) DO UPDATE SET
         memo = excluded.memo,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    )
    .run(code, input.memo, now, input.updatedBy ?? null);
  return getMaintenanceInspectionNote(code);
}

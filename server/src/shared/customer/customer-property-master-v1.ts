/**
 * Property Master — お客様ポータル用物件マスター（DOM 非依存 · React Native 流用）
 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../../db/database.js";
import { listBusinessProjects } from "../../business/business-store.js";
import { sanitizeSharePayloadTextV1 } from "../../knowledge/knowledge-customer-share-filter-v1.js";
import { sanitizePdfRequiredField } from "../../business/pdf/pdf-text-sanitize.js";
import { getCustomerMasterV1 } from "./customer-master-v1.js";

export interface PropertyMasterV1 {
  propertyId: string;
  customerCode: string;
  propertyName: string;
  address: string;
  projectRef: string | null;
  installedDate: string | null;
  nextInspectionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToProperty(row: Record<string, unknown>): PropertyMasterV1 {
  return {
    propertyId: String(row.property_id),
    customerCode: String(row.customer_code),
    propertyName: sanitizePdfRequiredField(String(row.property_name), "物件"),
    address: sanitizeSharePayloadTextV1(String(row.address ?? ""), ""),
    projectRef: row.project_ref != null ? String(row.project_ref) : null,
    installedDate: row.installed_date != null ? String(row.installed_date) : null,
    nextInspectionDate: row.next_inspection_date != null ? String(row.next_inspection_date) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function listPropertiesForCustomerV1(customerCode: string): PropertyMasterV1[] {
  const code = String(customerCode ?? "").trim().toUpperCase();
  return (
    getDatabase()
      .prepare(
        `SELECT * FROM customer_portal_properties WHERE customer_code = ? COLLATE NOCASE ORDER BY property_name ASC`
      )
      .all(code) as Array<Record<string, unknown>>
  ).map(rowToProperty);
}

export function getPropertyByProjectRefV1(projectRef: string): PropertyMasterV1 | null {
  const ref = String(projectRef ?? "").trim();
  if (!ref) return null;
  const row = getDatabase()
    .prepare(
      `SELECT * FROM customer_portal_properties
       WHERE project_ref = ? COLLATE NOCASE
          OR property_id = ? COLLATE NOCASE
       ORDER BY CASE WHEN project_ref = ? COLLATE NOCASE THEN 0 ELSE 1 END
       LIMIT 1`
    )
    .get(ref, ref, ref) as Record<string, unknown> | undefined;
  return row ? rowToProperty(row) : null;
}

export function getPropertyByIdV1(propertyId: string): PropertyMasterV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_portal_properties WHERE property_id = ?`)
    .get(propertyId) as Record<string, unknown> | undefined;
  return row ? rowToProperty(row) : null;
}

export function upsertPropertyMasterV1(
  input: Omit<PropertyMasterV1, "createdAt" | "updatedAt"> & { propertyId?: string }
): PropertyMasterV1 {
  const now = new Date().toISOString();
  const propertyId = input.propertyId?.trim() || `PROP-${uuid().slice(0, 8).toUpperCase()}`;
  const code = input.customerCode.trim().toUpperCase();
  getDatabase()
    .prepare(
      `INSERT INTO customer_portal_properties
       (property_id, customer_code, property_name, address, project_ref, installed_date, next_inspection_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(property_id) DO UPDATE SET
         customer_code = excluded.customer_code,
         property_name = excluded.property_name,
         address = excluded.address,
         project_ref = excluded.project_ref,
         installed_date = excluded.installed_date,
         next_inspection_date = excluded.next_inspection_date,
         updated_at = excluded.updated_at`
    )
    .run(
      propertyId,
      code,
      input.propertyName,
      input.address ?? "",
      input.projectRef,
      input.installedDate,
      input.nextInspectionDate,
      now,
      now
    );
  return getPropertyByIdV1(propertyId)!;
}

export function countPropertiesV1(): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(*) AS c FROM customer_portal_properties`)
    .get() as { c: number };
  return row.c;
}

/** business_projects から物件マスターを自動生成（customerCode 単位） */
export function syncPropertiesFromBusinessProjectsV1(customerCode: string): number {
  const master = getCustomerMasterV1(customerCode);
  if (!master) return 0;

  const existingRefs = new Set(
    listPropertiesForCustomerV1(customerCode)
      .map((p) => p.projectRef)
      .filter(Boolean) as string[]
  );

  let added = 0;
  for (const project of listBusinessProjects()) {
    const ref = project.projectNo || project.id;
    if (existingRefs.has(ref)) continue;

    const nameMatch =
      master.customerName &&
      (project.customerName.includes(master.customerName.replace(/デモ$/, "")) ||
        project.customerName.includes("TOMS") ||
        project.customerName.includes("トムズ") ||
        project.customerName.includes("山中"));
    const codeIsDemo = customerCode === "TOMS001";
    if (!nameMatch && !codeIsDemo) continue;

    upsertPropertyMasterV1({
      propertyId: `PROP-${ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`,
      customerCode,
      propertyName: sanitizePdfRequiredField(
        project.title?.trim() || `${project.municipality || "現場"} ${project.title}`,
        "TOMS設備デモ"
      ),
      address: project.address?.trim() || master.address,
      projectRef: ref,
      installedDate: project.constructionSchedule?.date ?? null,
      nextInspectionDate: null,
    });
    existingRefs.add(ref);
    added += 1;
  }
  return added;
}

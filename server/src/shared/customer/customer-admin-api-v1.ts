/**
 * Customer Admin — 編集・複数ファイルアップロード（社内専用）
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import {
  getCustomerMasterV1,
  upsertCustomerMasterV1,
  normalizeCustomerPortalPlanV1,
  type CustomerPortalPlanV1,
} from "./customer-master-v1.js";
import {
  getPropertyByIdV1,
  upsertPropertyMasterV1,
} from "./customer-property-master-v1.js";
import {
  upsertCustomerPortalDocumentV1,
  type CustomerFileDocTypeV1,
} from "./customer-files-v1.js";
import { onBusinessProjectUpdatedV1 } from "./customer-business-sync-v1.js";
import { findBusinessProjectByRefV1 } from "../../knowledge/knowledge-business-projects-adapter-v1.js";

function customerFilesRoot(): string {
  return path.join(process.cwd(), "customer-files");
}

const UPLOAD_DOC_TYPES = new Set<CustomerFileDocTypeV1>([
  "estimate",
  "invoice",
  "specification",
  "completion",
  "inspection",
]);

const UPLOAD_PHOTO_FOLDERS: Record<string, string> = {
  photo: "photos/memo",
  survey_photo: "photos/survey",
  drawing: "drawings",
  specification_file: "specification",
};

export function patchCustomerMasterAdminV1(input: {
  customerCode: string;
  customerName?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  plan?: string;
}): ReturnType<typeof upsertCustomerMasterV1> {
  const code = input.customerCode.trim().toUpperCase();
  const existing = getCustomerMasterV1(code);
  if (!existing) throw new Error("Customer not found");
  return upsertCustomerMasterV1({
    ...existing,
    customerName: input.customerName?.trim() ?? existing.customerName,
    address: input.address?.trim() ?? existing.address,
    contactName: input.contactName?.trim() ?? existing.contactName,
    contactPhone: input.contactPhone?.trim() ?? existing.contactPhone,
    contactEmail: input.contactEmail?.trim() ?? existing.contactEmail,
    plan: input.plan
      ? normalizeCustomerPortalPlanV1(input.plan)
      : existing.plan,
  });
}

export function patchPropertyMasterAdminV1(input: {
  propertyId: string;
  propertyName?: string;
  address?: string;
  installedDate?: string | null;
  nextInspectionDate?: string | null;
}): ReturnType<typeof upsertPropertyMasterV1> {
  const existing = getPropertyByIdV1(input.propertyId);
  if (!existing) throw new Error("Property not found");
  const updated = upsertPropertyMasterV1({
    ...existing,
    propertyName: input.propertyName?.trim() ?? existing.propertyName,
    address: input.address?.trim() ?? existing.address,
    installedDate:
      input.installedDate !== undefined ? input.installedDate : existing.installedDate,
    nextInspectionDate:
      input.nextInspectionDate !== undefined
        ? input.nextInspectionDate
        : existing.nextInspectionDate,
  });
  if (updated.projectRef) {
    const biz = findBusinessProjectByRefV1(updated.projectRef);
    if (biz?.id) onBusinessProjectUpdatedV1(biz.id);
  }
  return updated;
}

export function uploadCustomerAdminFilesV1(input: {
  customerCode: string;
  propertyId: string;
  projectRef?: string | null;
  fileType: string;
  files: Array<{ fileName: string; buffer: Buffer }>;
}): Array<{ fileName: string; relativePath: string }> {
  const property = getPropertyByIdV1(input.propertyId);
  if (!property || property.customerCode !== input.customerCode.toUpperCase()) {
    throw new Error("Property not found");
  }
  const code = input.customerCode.toUpperCase();
  const base = path.join(customerFilesRoot(), code, property.propertyId);
  const fileType = String(input.fileType ?? "photo").trim();
  const sub = UPLOAD_PHOTO_FOLDERS[fileType] ?? "files";
  const saved: Array<{ fileName: string; relativePath: string }> = [];

  for (const f of input.files) {
    const safeName = path.basename(f.fileName).replace(/[/\\:*?"<>|]/g, "_");
    const destDir =
      UPLOAD_DOC_TYPES.has(fileType as CustomerFileDocTypeV1)
        ? path.join(base, fileType)
        : path.join(base, sub);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, safeName);
    fs.writeFileSync(destPath, f.buffer);
    const relativePath = path.relative(customerFilesRoot(), destPath).replace(/\\/g, "/");
    saved.push({ fileName: safeName, relativePath });

    if (UPLOAD_DOC_TYPES.has(fileType as CustomerFileDocTypeV1) && input.projectRef) {
      upsertCustomerPortalDocumentV1({
        customerCode: code,
        propertyId: property.propertyId,
        projectRef: input.projectRef,
        docType: fileType as CustomerFileDocTypeV1,
        fileName: safeName,
        relativePath,
      });
    }
  }

  if (property.projectRef) {
    const biz = findBusinessProjectByRefV1(property.projectRef);
    if (biz?.id) onBusinessProjectUpdatedV1(biz.id);
  }
  return saved;
}

export const CUSTOMER_PORTAL_PLANS_V1: CustomerPortalPlanV1[] = [
  "Free",
  "Notify",
  "Standard",
  "PRO",
  "Enterprise",
];

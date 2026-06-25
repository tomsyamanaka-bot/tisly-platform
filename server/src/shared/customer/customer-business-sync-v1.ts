/**
 * business_projects → Customer / Property / Files / Documents 完全同期
 */

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import {
  getBusinessProject,
  getCustomer as getBusinessCustomer,
  listBusinessProjects,
} from "../../business/business-store.js";
import type { BusinessProject } from "../../business/business-types.js";
import { getCustomerByCode, getCustomerById } from "../../customer/customer-store.js";
import { listCompletionPhotosV1 } from "../../estimate/completion-photos-store.js";
import {
  listProjectPdfsV1,
  regenerateProjectPdfV1,
  type ProjectPdfKind,
} from "../../projects/project-pdf-store.js";
import {
  getCustomerMasterV1,
  listCustomerMastersV1,
  upsertCustomerMasterV1,
  type CustomerPortalPlanV1,
} from "./customer-master-v1.js";
import {
  getPropertyByProjectRefV1,
  upsertPropertyMasterV1,
  type PropertyMasterV1,
} from "./customer-property-master-v1.js";
import {
  CUSTOMER_FILE_DOC_LABELS_V1,
  syncProjectPdfsToCustomerFilesV1,
  type CustomerFileDocTypeV1,
} from "./customer-files-v1.js";
import { notifyPdfSyncedV1, notifyInspectionDeadlinesV1 } from "./customer-notifications-v1.js";
import { sanitizePdfRequiredField } from "../../business/pdf/pdf-text-sanitize.js";

export interface CustomerBusinessSyncResultV1 {
  projectId: string;
  customerCode: string;
  propertyId: string;
  projectRef: string;
  shareId: string;
  pdfsSynced: number;
  photosSynced: number;
  pdfsGenerated: number;
}

function customerFilesRoot(): string {
  return path.join(process.cwd(), "customer-files");
}

function shareIdFromRef(ref: string): string {
  return Buffer.from(String(ref).trim(), "utf8").toString("base64url");
}

function findMasterByBusinessCustomerId(businessCustomerId: string) {
  return listCustomerMastersV1(false).find((m) => m.businessCustomerId === businessCustomerId) ?? null;
}

function derivePortalCustomerCode(project: BusinessProject): string {
  const tenant = getCustomerById(project.customerId);
  if (tenant?.customer_code) return tenant.customer_code.toUpperCase();

  const linked = findMasterByBusinessCustomerId(project.customerId);
  if (linked) return linked.customerCode;

  const biz = getBusinessCustomer(project.customerId);
  if (biz?.name) {
    const byName = listCustomerMastersV1(false).find(
      (m) => m.customerName.includes(biz.name) || biz.name.includes(m.customerName.replace(/デモ$/, ""))
    );
    if (byName) return byName.customerCode;
  }

  const slug = (biz?.name ?? project.customerName)
    .replace(/[^\u3040-\u30ff\u4e00-\u9faf\w]/g, "")
    .slice(0, 10)
    .toUpperCase();
  return slug ? `CUS-${slug}` : `CUS-${uuid().slice(0, 6).toUpperCase()}`;
}

function mapTenantPlanToPortal(plan: string | undefined): CustomerPortalPlanV1 {
  const p = String(plan ?? "").toLowerCase();
  if (p.includes("enterprise")) return "Enterprise";
  if (p.includes("pro")) return "PRO";
  if (p.includes("notify")) return "Notify";
  if (p.includes("free") || p.includes("lite")) return "Free";
  if (p.includes("standard")) return "Standard";
  return "Standard";
}

export function ensureCustomerMasterForBusinessProjectV1(project: BusinessProject): string {
  const existingProp = getPropertyByProjectRefV1(project.projectNo);
  if (existingProp) return existingProp.customerCode;

  const linked = findMasterByBusinessCustomerId(project.customerId);
  if (linked) return linked.customerCode;

  const code = derivePortalCustomerCode(project);
  const existing = getCustomerMasterV1(code);
  const biz = getBusinessCustomer(project.customerId);
  const tenant = getCustomerByCode(code) ?? getCustomerById(project.customerId);

  if (!existing) {
    upsertCustomerMasterV1({
      customerCode: code,
      customerName: sanitizePdfRequiredField(project.customerName || biz?.name || code, "お客様"),
      address: project.address?.trim() || biz?.address || "",
      contactName: biz?.contactName || "",
      contactPhone: project.phone?.trim() || biz?.phone || "",
      contactEmail: biz?.email || "info@toms.co.jp",
      plan: mapTenantPlanToPortal(tenant?.plan),
      status: "active",
      businessCustomerId: project.customerId,
    });
  } else if (!existing.businessCustomerId) {
    upsertCustomerMasterV1({
      ...existing,
      businessCustomerId: project.customerId,
      contactPhone: existing.contactPhone || project.phone || biz?.phone || "",
      address: existing.address || project.address || biz?.address || "",
    });
  }
  return code;
}

export function ensurePropertyForBusinessProjectV1(
  project: BusinessProject,
  customerCode: string
): PropertyMasterV1 {
  const projectRef = project.projectNo || project.id;
  const existing = getPropertyByProjectRefV1(projectRef);
  const propertyId =
    existing?.propertyId ?? `PROP-${projectRef.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`;

  return upsertPropertyMasterV1({
    propertyId,
    customerCode: customerCode.toUpperCase(),
    propertyName: sanitizePdfRequiredField(
      project.title?.trim() || project.customerName,
      "物件"
    ),
    address: project.address?.trim() || existing?.address || "",
    projectRef,
    installedDate:
      project.constructionSchedule?.date ?? existing?.installedDate ?? null,
    nextInspectionDate: existing?.nextInspectionDate ?? null,
  });
}

async function ensureBusinessPdfsExistV1(projectId: string): Promise<number> {
  const project = getBusinessProject(projectId);
  if (!project) return 0;
  const kinds: ProjectPdfKind[] = [];
  if (project.estimateId) kinds.push("estimate");
  if (project.invoiceId) kinds.push("invoice");
  if (project.completionReportId) kinds.push("report");
  if (project.surveyProjectId) kinds.push("specification");

  let generated = 0;
  for (const kind of kinds) {
    const entry = listProjectPdfsV1(projectId).find((e) => e.kind === kind);
    if (entry?.exists) continue;
    try {
      await regenerateProjectPdfV1(projectId, kind);
      generated += 1;
    } catch (e) {
      console.warn("[customer-business-sync] PDF generate skipped", projectId, kind, e);
    }
  }
  return generated;
}

function copyPhotoIfNew(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

function resolveUploadPath(relOrAbs: string): string | null {
  const raw = String(relOrAbs ?? "").trim();
  if (!raw) return null;
  if (path.isAbsolute(raw) && fs.existsSync(raw)) return raw;
  const fromUploads = path.join(process.cwd(), "uploads", raw.replace(/^uploads[/\\]/, ""));
  if (fs.existsSync(fromUploads)) return fromUploads;
  const fromRoot = path.join(process.cwd(), raw);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return null;
}

export function syncBusinessPhotosToCustomerFilesV1(
  customerCode: string,
  project: BusinessProject,
  propertyId: string
): number {
  const base = path.join(customerFilesRoot(), customerCode.toUpperCase(), propertyId);
  let synced = 0;

  for (const photo of project.surveyPhotos ?? []) {
    const src = resolveUploadPath(photo.urlPath || "");
    if (!src) continue;
    const dest = path.join(base, "photos", "survey", path.basename(src));
    if (copyPhotoIfNew(src, dest)) synced += 1;
  }

  for (const photo of project.constructionPhotos ?? []) {
    const src = resolveUploadPath(photo.urlPath || "");
    if (!src) continue;
    const dest = path.join(base, "photos", "after", path.basename(src));
    if (copyPhotoIfNew(src, dest)) synced += 1;
  }

  for (const cp of listCompletionPhotosV1(project.id)) {
    const src = resolveUploadPath(cp.url);
    if (!src) continue;
    const dest = path.join(base, "photos", "completion", path.basename(src));
    if (copyPhotoIfNew(src, dest)) synced += 1;
  }

  const drawingDir = path.join(process.cwd(), "uploads", "business", project.id, "drawings");
  if (fs.existsSync(drawingDir)) {
    for (const name of fs.readdirSync(drawingDir)) {
      const src = path.join(drawingDir, name);
      if (!fs.statSync(src).isFile()) continue;
      const dest = path.join(base, "drawings", name);
      if (copyPhotoIfNew(src, dest)) synced += 1;
    }
  }

  return synced;
}

export async function syncBusinessProjectToCustomerPortalV1(
  projectId: string,
  opts?: { skipPdfGenerate?: boolean }
): Promise<CustomerBusinessSyncResultV1 | null> {
  const project = getBusinessProject(projectId);
  if (!project) return null;

  const customerCode = ensureCustomerMasterForBusinessProjectV1(project);
  const property = ensurePropertyForBusinessProjectV1(project, customerCode);
  const projectRef = property.projectRef ?? project.projectNo;
  const shareId = shareIdFromRef(projectRef);

  let pdfsGenerated = 0;
  if (!opts?.skipPdfGenerate) {
    pdfsGenerated = await ensureBusinessPdfsExistV1(projectId);
  }

  const pdfsSynced = syncProjectPdfsToCustomerFilesV1(
    customerCode,
    projectRef,
    property.propertyId
  );
  const photosSynced = syncBusinessPhotosToCustomerFilesV1(
    customerCode,
    project,
    property.propertyId
  );

  notifyInspectionDeadlinesV1(customerCode, [property]);

  return {
    projectId,
    customerCode,
    propertyId: property.propertyId,
    projectRef,
    shareId,
    pdfsSynced,
    photosSynced,
    pdfsGenerated,
  };
}

export async function syncAllBusinessProjectsToCustomerPortalV1(): Promise<number> {
  let count = 0;
  for (const p of listBusinessProjects()) {
    const result = await syncBusinessProjectToCustomerPortalV1(p.id, { skipPdfGenerate: true });
    if (result) count += 1;
  }
  return count;
}

export function onBusinessProjectUpdatedV1(projectId: string): void {
  void syncBusinessProjectToCustomerPortalV1(projectId).catch((e) => {
    console.error("[customer-business-sync] update sync failed", projectId, e);
  });
}

export function onBusinessProjectCreatedV1(projectId: string): void {
  void syncBusinessProjectToCustomerPortalV1(projectId).catch((e) => {
    console.error("[customer-business-sync] create sync failed", projectId, e);
  });
}

export function onProjectPdfSavedForCustomerV1(projectId: string, kind: ProjectPdfKind): void {
  void (async () => {
    const project = getBusinessProject(projectId);
    if (!project) return;
    const customerCode = ensureCustomerMasterForBusinessProjectV1(project);
    const property = ensurePropertyForBusinessProjectV1(project, customerCode);
    const projectRef = property.projectRef ?? project.projectNo;
    syncProjectPdfsToCustomerFilesV1(customerCode, projectRef, property.propertyId);
    const docMap: Partial<Record<ProjectPdfKind, string>> = {
      estimate: "estimate",
      invoice: "invoice",
      report: "completion",
      specification: "specification",
    };
    const docType = docMap[kind];
    if (docType) {
      notifyPdfSyncedV1({
        customerCode,
        propertyId: property.propertyId,
        projectRef,
        docType,
        label:
          CUSTOMER_FILE_DOC_LABELS_V1[docType as CustomerFileDocTypeV1] ??
          docType,
      });
    }
  })().catch((e) => console.error("[customer-business-sync] pdf hook", projectId, e));
}

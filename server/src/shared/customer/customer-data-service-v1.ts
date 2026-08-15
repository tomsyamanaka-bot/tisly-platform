/**
 * お客様ポータル データ取得サービス — UI とデータ分離（React Native 流用）
 */

import { tryResolveCustomerMetaFromBusinessProjectsV1 } from "../../knowledge/knowledge-business-projects-adapter-v1.js";
import { resolveCustomerProjectMetaV1 } from "../../knowledge/knowledge-customer-project-adapter-v1.js";
import { sanitizeSharePayloadTextV1 } from "../../knowledge/knowledge-customer-share-filter-v1.js";
import { TISLY_UI_LABELS_V1 } from "../ui-models/labels-v1.js";
import {
  buildCustomerContactActionsV1,
  getCustomerContactSettingsV1,
} from "./customer-contact-settings-v1.js";
import {
  CUSTOMER_FILE_DOC_LABELS_V1,
  listCustomerPortalFilesV1,
  syncProjectPdfsToCustomerFilesV1,
  type CustomerPortalFileRecordV1,
} from "./customer-files-v1.js";
import {
  countCustomerMastersV1,
  getCustomerMasterV1,
  listCustomerMastersV1,
  normalizeCustomerPortalPlanV1,
  syncCustomerMasterFromTenantsV1,
} from "./customer-master-v1.js";
import {
  countPropertiesV1,
  getPropertyByProjectRefV1,
  listPropertiesForCustomerV1,
  type PropertyMasterV1,
} from "./customer-property-master-v1.js";
import { countCustomerPortalDocumentsV1 } from "./customer-files-v1.js";
import { encodeCustomerShareIdV1, decodeCustomerShareIdV1 } from "./customer-share-id-v1.js";
import {
  buildCustomerDocumentUrlV1,
  buildCustomerHomeUrlV1,
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
} from "../routes/tisly-routes-v1.js";
import { syncAllBusinessProjectsToCustomerPortalV1 } from "./customer-business-sync-v1.js";
import {
  ensureCustomerMasterForBusinessProjectV1,
  ensurePropertyForBusinessProjectV1,
  syncBusinessPhotosToCustomerFilesV1,
} from "./customer-business-sync-v1.js";
import { getBusinessProject, listBusinessProjects } from "../../business/business-store.js";
import {
  listCustomerNotificationsV1,
  notifyInspectionDeadlinesV1,
  buildSyntheticMonitoringNotificationsV1,
} from "./customer-notifications-v1.js";
import { classifyInspectionDeadlineV1 } from "./customer-inspection-v1.js";
import type { CustomerContactV1, CustomerDocumentLinkV1, CustomerSitePhotoV1 } from "./customer-view-model-v1.js";

function shareIdFromRef(ref: string): string {
  return encodeCustomerShareIdV1(ref);
}

function refFromShareId(shareId: string): string {
  return decodeCustomerShareIdV1(shareId);
}

export interface CustomerPortalStatsV1 {
  customerMasterCount: number;
  propertyCount: number;
  documentCount: number;
  apiStatus: "ok" | "degraded";
  businessProjectSyncCount?: number;
}

const PHOTO_TYPES = new Set([
  "survey_photo",
  "before_photo",
  "during_photo",
  "after_photo",
  "memo_photo",
]);

let masterSynced = false;

export function ensureCustomerPortalMastersV1(): void {
  if (masterSynced) return;
  syncCustomerMasterFromTenantsV1();
  for (const row of listBusinessProjects()) {
    const project = getBusinessProject(row.id);
    if (!project) continue;
    const customerCode = ensureCustomerMasterForBusinessProjectV1(project);
    const property = ensurePropertyForBusinessProjectV1(project, customerCode);
    const ref = property.projectRef ?? project.projectNo;
    syncProjectPdfsToCustomerFilesV1(customerCode, ref, property.propertyId);
    syncBusinessPhotosToCustomerFilesV1(customerCode, project, property.propertyId);
  }
  for (const m of listCustomerMastersV1()) {
    notifyInspectionDeadlinesV1(m.customerCode, listPropertiesForCustomerV1(m.customerCode));
  }
  masterSynced = true;
}

/** 非同期フル同期（PDF 自動生成込み） */
export async function ensureCustomerPortalMastersAsyncV1(): Promise<void> {
  ensureCustomerPortalMastersV1();
  await syncAllBusinessProjectsToCustomerPortalV1();
}

export function resetCustomerPortalMasterSyncV1(): void {
  masterSynced = false;
}

export function getCustomerPortalStatsV1(): CustomerPortalStatsV1 {
  ensureCustomerPortalMastersV1();
  const masterCount = countCustomerMastersV1();
  const propertyCount = countPropertiesV1();
  const documentCount = countCustomerPortalDocumentsV1();
  return {
    customerMasterCount: masterCount,
    propertyCount,
    documentCount,
    apiStatus: masterCount > 0 ? "ok" : "degraded",
  };
}

export function resolveCustomerCodeForProjectRefV1(projectRef: string): string | null {
  ensureCustomerPortalMastersV1();
  for (const m of listCustomerMastersV1()) {
    const props = listPropertiesForCustomerV1(m.customerCode);
    if (props.some((p) => p.projectRef === projectRef)) return m.customerCode;
  }
  const prop = getPropertyByProjectRefV1(projectRef);
  return prop?.customerCode ?? null;
}

export function buildContactFromMasterV1(customerCode: string): CustomerContactV1 {
  ensureCustomerPortalMastersV1();
  const master = getCustomerMasterV1(customerCode);
  if (!master) {
    return {
      companyName: TISLY_UI_LABELS_V1.companyName,
      phone: "048-594-7077",
      email: "info@toms.co.jp",
      staffName: "担当営業",
    };
  }
  return {
    companyName: TISLY_UI_LABELS_V1.companyName,
    phone: master.contactPhone || undefined,
    email: master.contactEmail || undefined,
    staffName: master.contactName || "担当営業",
  };
}

export function listPropertiesForCustomerPortalV1(customerCode: string): PropertyMasterV1[] {
  ensureCustomerPortalMastersV1();
  const code = customerCode.trim().toUpperCase();
  return listPropertiesForCustomerV1(code);
}

export function listProjectListItemsForCustomerV1(customerCode: string): Array<{
  ref: string;
  propertyId: string;
  propertyName: string;
  workGenre: string;
  status: string;
  address: string;
  installedDate: string | null;
  nextInspectionDate: string | null;
  contractPlan: string;
  coverPhotoUrl: string | null;
  inspectionStatus: ReturnType<typeof classifyInspectionDeadlineV1>;
}> {
  const master = getCustomerMasterV1(customerCode);
  const planLabel = master ? normalizeCustomerPortalPlanV1(master.plan) : "Standard";
  const properties = listPropertiesForCustomerPortalV1(customerCode);
  return properties.map((p) => {
    const ref = p.projectRef ?? p.propertyId;
    const shareId = shareIdFromRef(ref);
    const meta =
      tryResolveCustomerMetaFromBusinessProjectsV1(ref) ?? resolveCustomerProjectMetaV1(ref);
    const files = listCustomerPortalFilesV1({
      customerCode,
      projectRef: ref,
      shareId,
      propertyId: p.propertyId,
    });
    const cover = files.find((f) => PHOTO_TYPES.has(f.type) && f.previewUrl);
    return {
      ref,
      propertyId: p.propertyId,
      propertyName: sanitizeSharePayloadTextV1(p.propertyName || meta?.displayName || "物件"),
      workGenre: sanitizeSharePayloadTextV1(meta?.workType ?? "設備工事"),
      status: sanitizeSharePayloadTextV1(meta?.status ?? "進行中"),
      address: sanitizeSharePayloadTextV1(p.address),
      installedDate: p.installedDate,
      nextInspectionDate: p.nextInspectionDate,
      contractPlan: planLabel,
      coverPhotoUrl: cover?.previewUrl ?? null,
      inspectionStatus: classifyInspectionDeadlineV1(p.nextInspectionDate),
    };
  });
}

export function fetchCustomerProjectFilesV1(
  shareId: string,
  customerCode?: string
): CustomerPortalFileRecordV1[] {
  ensureCustomerPortalMastersV1();
  const ref = refFromShareId(shareId);
  const code = customerCode ?? resolveCustomerCodeForProjectRefV1(ref);
  if (!code) return [];
  const property = getPropertyByProjectRefV1(ref);
  syncProjectPdfsToCustomerFilesV1(code, ref, property?.propertyId);
  return listCustomerPortalFilesV1({
    customerCode: code,
    projectRef: ref,
    shareId,
    propertyId: property?.propertyId,
  });
}

export function mapPortalFilesToPhotos(files: CustomerPortalFileRecordV1[]): CustomerSitePhotoV1[] {
  return files
    .filter((f) => PHOTO_TYPES.has(f.type) && f.previewUrl)
    .map((f) => ({
      photoId: f.fileId,
      title: sanitizeSharePayloadTextV1(f.safeLabel || f.title),
      previewUrl: f.previewUrl!,
      capturedAt: f.capturedAt,
    }));
}

const DOC_KIND_MAP: Record<string, CustomerDocumentLinkV1["kind"]> = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  completion: "completion",
  inspection: "inspection",
};

export function mapPortalFilesToDocuments(
  shareId: string,
  files: CustomerPortalFileRecordV1[]
): CustomerDocumentLinkV1[] {
  return files
    .filter((f) => !PHOTO_TYPES.has(f.type))
    .map((f) => ({
      fileId: f.fileId,
      label:
        CUSTOMER_FILE_DOC_LABELS_V1[f.type as keyof typeof CUSTOMER_FILE_DOC_LABELS_V1] ?? f.title,
      kind: DOC_KIND_MAP[f.type] ?? "other",
      openUrl: buildCustomerDocumentUrlV1(shareId, { docType: f.type, fileId: f.fileId }),
    }));
}

export function buildMaintenanceFromPropertyV1(
  property: PropertyMasterV1 | null
): Array<{ label: string; value: string }> {
  if (!property) {
    return [
      { label: "点検予定", value: "次回点検は担当よりご連絡いたします" },
      { label: "保守状況", value: "正常" },
    ];
  }
  const items: Array<{ label: string; value: string }> = [];
  const inspection = classifyInspectionDeadlineV1(property.nextInspectionDate);
  if (property.nextInspectionDate) {
    items.push({
      label: "点検予定",
      value: `${new Date(property.nextInspectionDate).toLocaleDateString("ja-JP")}（${inspection.label}）`,
    });
  } else {
    items.push({ label: "点検予定", value: "次回点検は担当よりご連絡いたします" });
  }
  items.push({ label: "保守状況", value: inspection.color === "red" ? "要確認" : "正常" });
  if (property.installedDate) {
    items.push({
      label: "設置日",
      value: new Date(property.installedDate).toLocaleDateString("ja-JP"),
    });
  }
  return items;
}

export function getPrimaryPropertyForCustomerV1(customerCode: string): PropertyMasterV1 | null {
  const list = listPropertiesForCustomerPortalV1(customerCode);
  return list[0] ?? null;
}

export function getDefaultCustomerLandingPropertyV1(): {
  shareId: string;
  propertyName: string;
  ref: string;
  customerCode: string;
} | null {
  ensureCustomerPortalMastersV1();
  const master = getCustomerMasterV1("TOMS001") ?? listCustomerMastersV1()[0];
  if (!master) return null;
  const properties = listPropertiesForCustomerPortalV1(master.customerCode);
  const property =
    properties.find((item) => item.projectRef) ??
    properties[0] ??
    null;
  if (!property) return null;
  const ref = property.projectRef ?? property.propertyId;
  return {
    shareId: shareIdFromRef(ref),
    propertyName: property.propertyName,
    ref,
    customerCode: master.customerCode,
  };
}

export function listCustomerNotificationsForHomeV1(customerCode: string) {
  ensureCustomerPortalMastersV1();
  const master = getCustomerMasterV1(customerCode);
  const stored = listCustomerNotificationsV1(customerCode, { limit: 12 });
  const synthetic =
    master && stored.length < 3
      ? buildSyntheticMonitoringNotificationsV1(master, listPropertiesForCustomerV1(customerCode))
      : [];
  const merged = [...stored, ...synthetic];
  const seen = new Set<string>();
  return merged.filter((n) => {
    const key = `${n.kind}:${n.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export {
  buildCustomerContactActionsV1,
  getCustomerContactSettingsV1,
};

export interface CustomerAdminRowV1 {
  customerCode: string;
  customerName: string;
  propertyId: string;
  propertyName: string;
  projectRef: string | null;
  shareId: string | null;
  plan: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  installedDate: string | null;
  nextInspectionDate: string | null;
  urls: {
    customer: string;
    project: string | null;
    document: string | null;
    monitoring: string | null;
  };
}

export function buildCustomerAdminListV1(opts?: {
  customerCode?: string;
  propertyQuery?: string;
}): CustomerAdminRowV1[] {
  ensureCustomerPortalMastersV1();
  const codeFilter = opts?.customerCode?.trim().toUpperCase();
  const propertyQuery = opts?.propertyQuery?.trim().toLowerCase() ?? "";

  const rows: CustomerAdminRowV1[] = [];
  for (const master of listCustomerMastersV1()) {
    if (codeFilter && master.customerCode !== codeFilter) continue;
    for (const property of listPropertiesForCustomerV1(master.customerCode)) {
      if (propertyQuery) {
        const hay = `${property.propertyName} ${property.projectRef ?? ""} ${property.address}`.toLowerCase();
        if (!hay.includes(propertyQuery)) continue;
      }
      const shareId = property.projectRef ? shareIdFromRef(property.projectRef) : null;
      rows.push({
        customerCode: master.customerCode,
        customerName: master.customerName,
        propertyId: property.propertyId,
        propertyName: property.propertyName,
        projectRef: property.projectRef,
        shareId,
        plan: normalizeCustomerPortalPlanV1(master.plan),
        address: property.address || master.address,
        contactPhone: master.contactPhone,
        contactEmail: master.contactEmail,
        installedDate: property.installedDate,
        nextInspectionDate: property.nextInspectionDate,
        urls: {
          customer: buildCustomerHomeUrlV1(master.customerCode),
          project: shareId ? buildCustomerProjectUrlV1(shareId) : null,
          document: shareId ? buildCustomerDocumentUrlV1(shareId) : null,
          monitoring: shareId ? buildCustomerMonitoringUrlV1(shareId) : null,
        },
      });
    }
  }
  return rows;
}

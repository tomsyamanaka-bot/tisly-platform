/**
 * お客様ポータルデータ整形 — Customer/Property Master から自動生成
 */

import { tryResolveCustomerMetaFromBusinessProjectsV1 } from "../../knowledge/knowledge-business-projects-adapter-v1.js";
import { resolveCustomerProjectMetaV1 } from "../../knowledge/knowledge-customer-project-adapter-v1.js";
import { sanitizeSharePayloadTextV1 } from "../../knowledge/knowledge-customer-share-filter-v1.js";
import {
  buildCustomerDocumentUrlV1,
  buildCustomerHomeUrlV1,
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
  TISLY_CUSTOMER_PWA_START_URL,
} from "../routes/tisly-routes-v1.js";
import { TISLY_UI_LABELS_V1 } from "../ui-models/labels-v1.js";
import {
  buildContactFromMasterV1,
  buildCustomerContactActionsV1,
  buildMaintenanceFromPropertyV1,
  fetchCustomerProjectFilesV1,
  getCustomerContactSettingsV1,
  getDefaultCustomerLandingPropertyV1,
  listCustomerNotificationsForHomeV1,
  listProjectListItemsForCustomerV1,
  mapPortalFilesToDocuments,
  mapPortalFilesToPhotos,
  resolveCustomerCodeForProjectRefV1,
} from "./customer-data-service-v1.js";
import { buildCustomerHomeStateV1 } from "./customer-home-state-v1.js";
import { buildCustomerMonitoringDetailV1 } from "./customer-monitoring-state-v1.js";
import { buildCustomerPropertyListItemV1 } from "./customer-property-list-v1.js";
import type { CustomerSystemStatusKeyV1 } from "./customer-labels-v1.js";
import { buildCustomerProjectQuickActionsV1 } from "./customer-project-actions-v1.js";
import { getPropertyByProjectRefV1 } from "./customer-property-master-v1.js";
import { getCustomerMasterV1, normalizeCustomerPortalPlanV1 } from "./customer-master-v1.js";
import { encodeCustomerShareIdV1, decodeCustomerShareIdV1 } from "./customer-share-id-v1.js";
import type {
  CustomerContactV1,
  CustomerHomeListViewV1,
  CustomerPortalLandingV1,
  CustomerProjectViewV1,
} from "./customer-view-model-v1.js";

function refFromShareId(shareId: string): string {
  return decodeCustomerShareIdV1(shareId);
}

export function shareIdFromRef(ref: string): string {
  return encodeCustomerShareIdV1(ref);
}

export function buildCustomerPortalLandingV1(): CustomerPortalLandingV1 {
  const primary = getDefaultCustomerLandingPropertyV1();
  if (!primary) {
    const home = buildCustomerHomeStateV1({
      shareId: "",
      propertyName: "お客様の物件",
      ref: "",
      contact: buildContactFromMasterV1("TOMS001"),
    });
    return { home, demoProjects: [] };
  }

  const home = buildCustomerHomeStateV1({
    shareId: primary.shareId,
    propertyName: primary.propertyName,
    ref: primary.ref,
    contact: buildContactFromMasterV1(primary.customerCode),
    notifications: listCustomerNotificationsForHomeV1(primary.customerCode),
  });

  const projects = listProjectListItemsForCustomerV1(primary.customerCode).map((p) => {
    const shareId = shareIdFromRef(p.ref);
    return {
      shareId,
      propertyName: p.propertyName,
      projectPageUrl: buildCustomerProjectUrlV1(shareId),
      homePageUrl: `/customer?project=${encodeURIComponent(shareId)}`,
    };
  });

  return { home, demoProjects: projects };
}

export function buildCustomerHomeListViewV1(customerCode: string): CustomerHomeListViewV1 {
  const code = String(customerCode ?? "").trim().toUpperCase();
  const masterContact = buildContactFromMasterV1(code);
  const contactSettings = getCustomerContactSettingsV1(code);
  const contactActions = buildCustomerContactActionsV1(masterContact, contactSettings);
  const projects = listProjectListItemsForCustomerV1(code);

  const masterRecord = getCustomerMasterV1(code);
  const customerName = masterRecord?.customerName ?? (code === "TOMS001" ? "TOMS設備デモ" : `${code} 様`);

  return {
    customerName,
    contractPlan: normalizeCustomerPortalPlanV1(masterRecord?.plan ?? "Standard"),
    notifications: listCustomerNotificationsForHomeV1(code),
    projects: projects.map((p) => {
      const shareId = shareIdFromRef(p.ref);
      const meta = resolveCustomerProjectMetaV1(p.ref);
      const propertyName = sanitizeSharePayloadTextV1(p.propertyName || meta?.displayName || "物件");
      const monitoring = buildCustomerMonitoringDetailV1(
        shareId,
        propertyName,
        p.ref,
        masterContact,
        contactActions
      );
      return buildCustomerPropertyListItemV1(
        {
          shareId,
          propertyName,
          address: p.address,
          coverPhotoUrl: p.coverPhotoUrl,
          contractPlan: p.contractPlan,
          installedDate: p.installedDate,
          nextInspectionDate: p.nextInspectionDate,
          inspectionColor: p.inspectionStatus.color,
          inspectionLabel: p.inspectionStatus.label,
          workDescription: sanitizeSharePayloadTextV1(p.workGenre),
          statusLabel: sanitizeSharePayloadTextV1(p.status),
          projectPageUrl: buildCustomerProjectUrlV1(shareId),
          homePageUrl: `/customer?project=${encodeURIComponent(shareId)}`,
          systemStatusKey: monitoring.systemStatus as CustomerSystemStatusKeyV1,
          lastCheckedIso: monitoring.lastCheckedIso,
        },
        masterContact,
        contactActions
      );
    }),
    contact: masterContact,
    contactActions,
  };
}

/** @deprecated use buildCustomerHomeListViewV1 */
export function buildCustomerHomeViewV1(customerCode: string) {
  return buildCustomerHomeListViewV1(customerCode);
}

export function buildCustomerProjectViewV1(shareId: string): CustomerProjectViewV1 | null {
  const ref = refFromShareId(shareId);
  const meta =
    tryResolveCustomerMetaFromBusinessProjectsV1(ref) ?? resolveCustomerProjectMetaV1(ref);
  const property = getPropertyByProjectRefV1(ref);
  if (!meta && !property) return null;

  const customerCode = resolveCustomerCodeForProjectRefV1(ref) ?? "TOMS001";
  const contact = buildContactFromMasterV1(customerCode);
  const contactSettings = getCustomerContactSettingsV1(customerCode);
  const contactActions = buildCustomerContactActionsV1(contact, contactSettings);

  const files = fetchCustomerProjectFilesV1(shareId, customerCode);
  const encodedShareId = shareIdFromRef(ref);

  const propertyName = sanitizeSharePayloadTextV1(
    property?.propertyName ?? meta?.displayName ?? "物件"
  );
  const workDescription = sanitizeSharePayloadTextV1(
    meta?.workSummary ?? meta?.workType ?? "設備工事"
  );
  const statusLabel = sanitizeSharePayloadTextV1(meta?.status ?? "進行中");
  const explanationText =
    meta?.customerNotes?.trim() ||
    `${meta?.city ?? property?.address ?? ""}の${meta?.workType ?? "設備"}に関する工事内容をご確認いただけます。`;

  return {
    shareId: encodedShareId,
    propertyName,
    workDescription,
    statusLabel,
    sitePhotos: mapPortalFilesToPhotos(files),
    documents: mapPortalFilesToDocuments(encodedShareId, files),
    maintenanceItems: buildMaintenanceFromPropertyV1(property),
    customerExplanation: sanitizeSharePayloadTextV1(explanationText),
    monitoringUrl: buildCustomerMonitoringUrlV1(encodedShareId),
    contact,
    contactActions,
    quickActions: buildCustomerProjectQuickActionsV1(encodedShareId, contact, contactActions),
    projectPageUrl: buildCustomerProjectUrlV1(encodedShareId),
  };
}

export function buildCustomerDocumentViewV1(
  shareId: string,
  opts?: { fileId?: string; docType?: string }
): {
  shareId: string;
  propertyName: string;
  fileId: string;
  label: string;
  previewUrl?: string;
  pdfUrl?: string;
  backUrl: string;
  status?: "ok" | "preparing";
  message?: string;
} | null {
  const project = buildCustomerProjectViewV1(shareId);
  if (!project) return null;

  const ref = refFromShareId(shareId);
  const customerCode = resolveCustomerCodeForProjectRefV1(ref) ?? "TOMS001";
  const files = fetchCustomerProjectFilesV1(shareId, customerCode).filter(
    (f) => !f.type.includes("photo")
  );

  const docType = opts?.docType?.trim();
  const fileId = opts?.fileId?.trim();

  const target =
    (fileId ? files.find((f) => f.fileId === fileId) : null) ??
    (docType ? files.find((f) => f.type === docType) : null) ??
    files.find((f) => f.type === "completion") ??
    files.find((f) => f.type === "estimate") ??
    files.find((f) => f.type === "invoice") ??
    files.find((f) => f.type === "specification") ??
    files[0];

  const backUrl = buildCustomerProjectUrlV1(project.shareId);
  const preparingMessage =
    "書類を準備中です。時間をおいて再度開いてください。お急ぎの場合はTOMSへご連絡ください。";

  if (!target || !target.fileId) {
    return {
      shareId: project.shareId,
      propertyName: project.propertyName,
      fileId: fileId ?? (docType ? `doc-${docType}` : ""),
      label: TISLY_UI_LABELS_V1.preparing,
      status: "preparing",
      message: preparingMessage,
      backUrl,
    };
  }

  const apiUrl = target.openUrl;
  return {
    shareId: project.shareId,
    propertyName: project.propertyName,
    fileId: target.fileId,
    label: target.safeLabel || target.title,
    previewUrl: apiUrl,
    pdfUrl: apiUrl,
    backUrl,
    status: "ok",
  };
}

export function buildCustomerMonitoringViewV1(shareId: string) {
  const project = buildCustomerProjectViewV1(shareId);
  if (!project) return null;

  const ref = refFromShareId(shareId);
  const customerCode = resolveCustomerCodeForProjectRefV1(ref) ?? "TOMS001";
  const contact = buildContactFromMasterV1(customerCode);
  const contactSettings = getCustomerContactSettingsV1(customerCode);
  const contactActions = buildCustomerContactActionsV1(contact, contactSettings);

  return buildCustomerMonitoringDetailV1(
    project.shareId,
    project.propertyName,
    ref,
    contact,
    contactActions
  );
}

export function resolveBusinessProjectForCustomerPortalV1(ref: string) {
  const meta = tryResolveCustomerMetaFromBusinessProjectsV1(ref);
  if (meta) return meta;
  return resolveCustomerProjectMetaV1(ref);
}

export function buildCustomerHomeByShareIdV1(
  shareId: string
): ReturnType<typeof buildCustomerHomeStateV1> | null {
  const project = buildCustomerProjectViewV1(shareId);
  if (!project) return null;
  const ref = refFromShareId(shareId);
  const customerCode = resolveCustomerCodeForProjectRefV1(ref) ?? "TOMS001";
  return buildCustomerHomeStateV1({
    shareId: project.shareId,
    propertyName: project.propertyName,
    ref,
    contact: buildContactFromMasterV1(customerCode),
    notifications: listCustomerNotificationsForHomeV1(customerCode),
  });
}

export { buildCustomerHomeUrlV1, TISLY_CUSTOMER_PWA_START_URL };

/**
 * お客様ポータルデータ整形 — business_projects → CustomerView（内部情報フィルタ）
 */

import {
  listCustomerProjectsFromBusinessDbV1,
  tryResolveCustomerMetaFromBusinessProjectsV1,
} from "../../knowledge/knowledge-business-projects-adapter-v1.js";
import { resolveCustomerProjectMetaV1 } from "../../knowledge/knowledge-customer-project-adapter-v1.js";
import { listCustomerProjectFilesV1 } from "../../knowledge/knowledge-customer-project-files-v1.js";
import { sanitizeSharePayloadTextV1 } from "../../knowledge/knowledge-customer-share-filter-v1.js";
import {
  buildCustomerDocumentUrlV1,
  buildCustomerHomeUrlV1,
  buildCustomerMonitoringUrlV1,
  buildCustomerProjectUrlV1,
  TISLY_CUSTOMER_PWA_START_URL,
} from "../routes/tisly-routes-v1.js";
import { TISLY_UI_LABELS_V1 } from "../ui-models/labels-v1.js";
import { buildCustomerHomeStateV1 } from "./customer-home-state-v1.js";
import { buildCustomerMonitoringDetailV1 } from "./customer-monitoring-state-v1.js";
import { encodeCustomerShareIdV1, decodeCustomerShareIdV1 } from "./customer-share-id-v1.js";
import {
  customerPortalDocLabelV1,
  filterCustomerPortalProjectFilesV1,
} from "./customer-project-files-filter-v1.js";
import type {
  CustomerContactV1,
  CustomerDocumentLinkV1,
  CustomerHomeListViewV1,
  CustomerPortalLandingV1,
  CustomerProjectViewV1,
  CustomerSitePhotoV1,
} from "./customer-view-model-v1.js";

const PHOTO_TYPES = new Set([
  "survey_photo",
  "before_photo",
  "during_photo",
  "after_photo",
  "memo_photo",
]);

const DOC_TYPE_MAP: Record<string, CustomerDocumentLinkV1["kind"]> = {
  specification_pdf: "specification",
  completion_pdf: "completion",
  estimate_pdf: "estimate",
  invoice_pdf: "invoice",
  manual_pdf: "manual",
};

function defaultContact(): CustomerContactV1 {
  return {
    companyName: TISLY_UI_LABELS_V1.companyName,
    phone: "048-000-0000",
    email: "info@toms.co.jp",
    staffName: "担当営業",
  };
}

function refFromShareId(shareId: string): string {
  return decodeCustomerShareIdV1(shareId);
}

export function shareIdFromRef(ref: string): string {
  return encodeCustomerShareIdV1(ref);
}

function mapPhotos(files: ReturnType<typeof filterCustomerPortalProjectFilesV1>): CustomerSitePhotoV1[] {
  return files
    .filter((f) => PHOTO_TYPES.has(f.type) && f.previewUrl)
    .map((f) => ({
      photoId: f.fileId,
      title: sanitizeSharePayloadTextV1(f.safeLabel || f.title),
      previewUrl: f.previewUrl!,
      capturedAt: f.capturedAt,
    }));
}

function mapDocuments(
  shareId: string,
  files: ReturnType<typeof filterCustomerPortalProjectFilesV1>
): CustomerDocumentLinkV1[] {
  return files
    .filter((f) => f.type.endsWith("_pdf"))
    .map((f) => ({
      fileId: f.fileId,
      label: customerPortalDocLabelV1(f.type, sanitizeSharePayloadTextV1(f.safeLabel || f.title)),
      kind: DOC_TYPE_MAP[f.type] ?? "other",
      openUrl: buildCustomerDocumentUrlV1(shareId, f.fileId),
    }));
}

function defaultMaintenanceItems(ref: string): CustomerProjectViewV1["maintenanceItems"] {
  return [
    { label: "点検予定", value: "次回点検は担当よりご連絡いたします" },
    { label: "保守状況", value: "正常" },
    { label: "最終確認", value: new Date().toLocaleDateString("ja-JP") },
  ];
}

const DEMO_PROJECTS = [
  { ref: "MO-26-0709", propertyName: "守谷市 戸建て防犯設備" },
  { ref: "DEMO-HOME-001", propertyName: "デモ戸建て防犯" },
];

export function buildCustomerPortalLandingV1(): CustomerPortalLandingV1 {
  const primary = DEMO_PROJECTS[1];
  const primaryShareId = shareIdFromRef(primary.ref);
  const home = buildCustomerHomeStateV1({
    shareId: primaryShareId,
    propertyName: primary.propertyName,
    ref: primary.ref,
  });

  return {
    home,
    demoProjects: DEMO_PROJECTS.map((d) => {
      const shareId = shareIdFromRef(d.ref);
      return {
        shareId,
        propertyName: d.propertyName,
        projectPageUrl: buildCustomerProjectUrlV1(shareId),
        homePageUrl: `/customer?project=${encodeURIComponent(shareId)}`,
      };
    }),
  };
}

export function buildCustomerHomeListViewV1(customerCode: string): CustomerHomeListViewV1 {
  const code = String(customerCode ?? "").trim().toUpperCase();
  const fromDb = listCustomerProjectsFromBusinessDbV1();
  const projects =
    fromDb.length > 0
      ? fromDb.slice(0, 12)
      : DEMO_PROJECTS.map((d) => ({
          ref: d.ref,
          propertyName: d.propertyName,
          workGenre: "設備工事",
          status: "進行中",
        }));

  return {
    customerName: code === "TOMS001" ? "トムズ設備 様" : `${code} 様`,
    projects: projects.map((p) => {
      const ref = "ref" in p ? String(p.ref) : refFromShareId((p as { shareId: string }).shareId);
      const shareId = shareIdFromRef(ref);
      const meta = resolveCustomerProjectMetaV1(ref);
      return {
        shareId,
        propertyName: sanitizeSharePayloadTextV1(
          "propertyName" in p ? p.propertyName : meta.displayName
        ),
        workDescription: sanitizeSharePayloadTextV1(
          "workGenre" in p ? p.workGenre : meta.workType
        ),
        statusLabel: sanitizeSharePayloadTextV1(
          "status" in p ? p.status : meta.status
        ),
        projectPageUrl: buildCustomerProjectUrlV1(shareId),
        homePageUrl: `/customer?project=${encodeURIComponent(shareId)}`,
      };
    }),
    contact: defaultContact(),
  };
}

/** @deprecated use buildCustomerHomeListViewV1 */
export function buildCustomerHomeViewV1(customerCode: string) {
  return buildCustomerHomeListViewV1(customerCode);
}

export function buildCustomerProjectViewV1(shareId: string): CustomerProjectViewV1 | null {
  const ref = refFromShareId(shareId);
  const meta = resolveCustomerProjectMetaV1(ref);
  if (!meta) return null;

  const files = filterCustomerPortalProjectFilesV1(listCustomerProjectFilesV1(ref));
  const encodedShareId = shareIdFromRef(meta.ref);

  const explanationText =
    meta.customerNotes?.trim() ||
    `${meta.city}の${meta.workType}に関する工事内容をご確認いただけます。`;

  return {
    shareId: encodedShareId,
    propertyName: sanitizeSharePayloadTextV1(meta.displayName),
    workDescription: sanitizeSharePayloadTextV1(meta.workSummary || meta.workType),
    statusLabel: sanitizeSharePayloadTextV1(meta.status),
    sitePhotos: mapPhotos(files),
    documents: mapDocuments(encodedShareId, files),
    maintenanceItems: defaultMaintenanceItems(ref),
    customerExplanation: sanitizeSharePayloadTextV1(explanationText),
    monitoringUrl: buildCustomerMonitoringUrlV1(encodedShareId),
    contact: defaultContact(),
    projectPageUrl: buildCustomerProjectUrlV1(encodedShareId),
  };
}

export function buildCustomerDocumentViewV1(
  shareId: string,
  fileId?: string
): {
  shareId: string;
  propertyName: string;
  fileId: string;
  label: string;
  previewUrl?: string;
  pdfUrl?: string;
  backUrl: string;
} | null {
  const project = buildCustomerProjectViewV1(shareId);
  if (!project) return null;

  const ref = refFromShareId(shareId);
  const files = filterCustomerPortalProjectFilesV1(listCustomerProjectFilesV1(ref));
  const target =
    files.find((f) => f.fileId === fileId) ??
    files.find((f) => f.type === "specification_pdf") ??
    files.find((f) => f.type === "completion_pdf") ??
    files[0];

  if (!target) {
    return {
      shareId: project.shareId,
      propertyName: project.propertyName,
      fileId: fileId ?? "",
      label: TISLY_UI_LABELS_V1.preparing,
      backUrl: buildCustomerProjectUrlV1(project.shareId),
    };
  }

  const preview = target.openUrl ?? target.previewUrl;
  return {
    shareId: project.shareId,
    propertyName: project.propertyName,
    fileId: target.fileId,
    label: customerPortalDocLabelV1(
      target.type,
      sanitizeSharePayloadTextV1(target.safeLabel || target.title)
    ),
    previewUrl: preview,
    pdfUrl: preview,
    backUrl: buildCustomerProjectUrlV1(project.shareId),
  };
}

export function buildCustomerMonitoringViewV1(shareId: string) {
  const project = buildCustomerProjectViewV1(shareId);
  if (!project) return null;

  const ref = refFromShareId(shareId);
  return buildCustomerMonitoringDetailV1(project.shareId, project.propertyName, ref);
}

export function resolveBusinessProjectForCustomerPortalV1(ref: string) {
  const meta = tryResolveCustomerMetaFromBusinessProjectsV1(ref);
  if (meta) return meta;
  return resolveCustomerProjectMetaV1(ref);
}

export function buildCustomerHomeByShareIdV1(shareId: string): ReturnType<typeof buildCustomerHomeStateV1> | null {
  const project = buildCustomerProjectViewV1(shareId);
  if (!project) return null;
  const ref = refFromShareId(shareId);
  return buildCustomerHomeStateV1({
    shareId: project.shareId,
    propertyName: project.propertyName,
    ref,
  });
}

export { buildCustomerHomeUrlV1, TISLY_CUSTOMER_PWA_START_URL };

/** 案件管理基盤 v1 — 案件マスター一覧・詳細・作成 */

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import {
  getBusinessProject,
  updateBusinessProject,
} from "../business/business-store.js";
import type { BusinessProject } from "../business/business-types.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { addProjectTimelineEventV1 } from "./project-timeline-v1-store.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import { listCompletionPhotosV1 } from "../estimate/completion-photos-store.js";
import { getEstimate, getInvoice } from "../business/business-store.js";
import { listProjectPdfsV1 } from "./project-pdf-store.js";
import { softDeleteAllProjectPdfMeta } from "./project-pdf-qnap-store.js";
import {
  allocateProjectNoV1,
  buildQnapFolderPathV1,
  listProjectCityCodesV1,
  resolveCityCodeForProject,
} from "./project-id-v1.js";
import {
  deriveProjectStatusFromRowV1,
  mgmtStatusToBusinessStatus,
  PROJECT_MGMT_STATUS_LABELS,
  type ProjectMgmtStatus,
} from "./project-mgmt-status-v1.js";
import {
  PROJECT_STATUS_COLOR_GROUP_V1,
  projectStatusMatchesFilterV1,
} from "./project-status-v1.js";
import {
  buildWorkflowCardsV2,
  buildNextActionsV1,
  listPdfShareHistoryV2,
  listProjectTimelineV2,
  type NextActionItemV1,
} from "./project-mgmt-v2-store.js";
import { getProjectDocumentsStatusV1, type ProjectDocumentsStatusV1 } from "./project-documents-v1.js";
import { createProjectStorageFoldersV1 } from "../storage/project-storage-v1.js";
import { onBusinessProjectCreatedV1 } from "../shared/customer/customer-business-sync-v1.js";
import { getProjectAutomationBundleV1, applyProjectTemplateV1 } from "./project-automation-v1-store.js";
import { refreshAiSuggestionsV1 } from "./project-automation-suggestions-v1.js";
import { getProjectStatusV1, type ProjectStatusResultV1 } from "./project-status-v1.js";
import {
  buildOperationalStatusBundleV1,
  type OperationalStatusBundleV1,
} from "./operational-status-v1.js";
import {
  buildDetailReturnUrl,
  buildOperationalWorkflowHrefsV1,
} from "./operational-href-v1.js";
import {
  buildOperationalChecklistV1,
  type OperationalChecklistV1,
} from "./operational-checklist-v1.js";
import { buildProjectProfitSummaryV1, type ProjectProfitSummaryV1 } from "./project-profit-v1.js";
import { buildProjectPdfCenterV1, type ProjectPdfCenterV1 } from "./project-pdf-center-v1.js";
import { syncProjectStatusAutoV1 } from "./project-status-auto-v1.js";

export interface ProjectMgmtListItemV1 {
  id: string;
  projectNo: string;
  title: string;
  customerName: string;
  address: string;
  municipality: string;
  assignee: string;
  mgmtStatus: ProjectMgmtStatus;
  mgmtStatusLabel: string;
  statusColor: string;
  createdAt: string;
  updatedAt: string;
  automation?: {
    tasksPercent: number;
    toolsPercent: number;
    photosPercent: number;
    documentsPercent: number;
  } | null;
}

export interface ProjectMgmtDetailV1 {
  project: ProjectMgmtListItemV1 & {
    phone: string;
    surveyProjectId: string | null;
    estimateId: string | null;
    invoiceId: string | null;
    completionReportId: string | null;
    qnapFolderPath: string;
    qnapSyncStatus: string;
    businessStatus: string;
  };
  survey: {
    linked: boolean;
    surveyProjectId: string | null;
    photoCount: number;
    href: string | null;
  };
  estimate: {
    linked: boolean;
    estimateId: string | null;
    estimateNo: string | null;
    total: number | null;
    href: string | null;
  };
  invoice: {
    linked: boolean;
    invoiceId: string | null;
    invoiceNo: string | null;
    total: number | null;
    href: string | null;
  };
  completionReport: {
    linked: boolean;
    completionReportId: string | null;
    href: string | null;
  };
  photos: {
    surveyCount: number;
    completionCount: number;
  };
  documents: ReturnType<typeof listProjectPdfsV1>;
  fieldOpsHref: string;
  workflowCards: ReturnType<typeof buildWorkflowCardsV2>;
  nextActions: NextActionItemV1[];
  documentsStatus: ProjectDocumentsStatusV1 | null;
  timeline: ReturnType<typeof listProjectTimelineV2>;
  shareHistory: ReturnType<typeof listPdfShareHistoryV2>;
  projectStatus: ProjectStatusResultV1 | null;
  operational: OperationalStatusBundleV1;
  checklist: OperationalChecklistV1;
  profit: ProjectProfitSummaryV1;
  pdfCenter: ProjectPdfCenterV1;
  automation: ReturnType<typeof getProjectAutomationBundleV1> | null;
}

function rowToListItem(r: Record<string, unknown>): ProjectMgmtListItemV1 {
  const mgmtStatus = deriveProjectStatusFromRowV1(r);

  return {
    id: String(r.id),
    projectNo: String(r.project_no ?? r.id),
    title: String(r.title ?? ""),
    customerName: String(r.customer_name ?? ""),
    address: String(r.address ?? ""),
    municipality: String(r.municipality ?? ""),
    assignee: String(r.assignee ?? ""),
    mgmtStatus,
    mgmtStatusLabel: PROJECT_MGMT_STATUS_LABELS[mgmtStatus],
    statusColor: PROJECT_STATUS_COLOR_GROUP_V1[mgmtStatus],
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function matchesSearch(r: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const fields = [
    String(r.project_no ?? ""),
    String(r.customer_name ?? ""),
    String(r.address ?? ""),
    String(r.title ?? ""),
  ];
  return fields.some((f) => f.toLowerCase().includes(needle));
}

export function listProjectMgmtV1(opts?: {
  q?: string;
  status?: ProjectMgmtStatus;
  limit?: number;
}): ProjectMgmtListItemV1[] {
  const limit = opts?.limit ?? 200;
  const rows = getDatabase()
    .prepare(
      `SELECT id, project_no, title, customer_name, address, municipality, assignee,
              status, invoice_id, paid_date, estimate_id, survey_project_id,
              survey_schedule_json, construction_schedule_json, created_at, updated_at
       FROM business_projects
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;

  return rows
    .filter((r) => matchesSearch(r, opts?.q ?? ""))
    .filter((r) => {
      if (!opts?.status) return true;
      return projectStatusMatchesFilterV1(r, opts.status);
    })
    .map(rowToListItem);
}

export function getProjectMgmtDetailV1(projectId: string): ProjectMgmtDetailV1 | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM business_projects WHERE id = ? AND deleted_at IS NULL`)
    .get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const base = rowToListItem(row);
  const surveyProjectId =
    row.survey_project_id != null ? String(row.survey_project_id) : null;
  const estimateId = row.estimate_id != null ? String(row.estimate_id) : null;
  const invoiceId = row.invoice_id != null ? String(row.invoice_id) : null;
  const completionReportId =
    row.completion_report_id != null ? String(row.completion_report_id) : null;

  const estimate = estimateId ? getEstimate(estimateId) : null;
  const invoice = invoiceId ? getInvoice(invoiceId) : null;

  const surveyPhotos = surveyProjectId ? listSurveyPhotosV1(surveyProjectId) : [];
  const completionPhotos = listCompletionPhotosV1(projectId);

  const detailReturnUrl = buildDetailReturnUrl(projectId);
  const workflowHrefs = buildOperationalWorkflowHrefsV1({
    projectId,
    surveyProjectId,
    detailReturnUrl,
  });

  const orderedStatuses = new Set([
    "accepted",
    "ordered",
    "construction_scheduled",
    "construction_done",
    "completion_report_created",
    "invoice_created",
    "invoice_sent",
    "invoiced",
    "paid",
    "closed",
  ]);
  const workDoneStatuses = new Set([
    "construction_done",
    "completion_report_created",
    "invoice_created",
    "invoice_sent",
    "invoiced",
    "paid",
    "closed",
  ]);
  const businessStatus = String(row.status ?? "new").toLowerCase();

  const completionDoc = getProjectDocumentsStatusV1(projectId)?.documents.find(
    (d) => d.kind === "completion"
  );
  const hasCompletionPdf = Boolean(completionDoc?.hasPdf);

  const operational = buildOperationalStatusBundleV1({
    projectId,
    mgmtStatus: base.mgmtStatus,
    surveyProjectId,
    hasEstimate: Boolean(estimateId),
    hasInvoice: Boolean(invoiceId),
    isOrdered: orderedStatuses.has(businessStatus),
    hasWorkCompleted: workDoneStatuses.has(businessStatus),
    hasCompletionPdf,
  });

  return {
    project: {
      ...base,
      phone: String(row.phone ?? ""),
      surveyProjectId,
      estimateId,
      invoiceId,
      completionReportId,
      qnapFolderPath: String(row.qnap_folder_path ?? ""),
      qnapSyncStatus: String(row.qnap_sync_status ?? "pending"),
      businessStatus: String(row.status ?? "new"),
    },
    survey: {
      linked: Boolean(surveyProjectId),
      surveyProjectId,
      photoCount: surveyPhotos.length,
      href: workflowHrefs.survey,
    },
    estimate: {
      linked: Boolean(estimateId),
      estimateId,
      estimateNo: estimate?.estimateNo ?? null,
      total: estimate?.total ?? null,
      href: workflowHrefs.estimate,
    },
    invoice: {
      linked: Boolean(invoiceId),
      invoiceId,
      invoiceNo: invoice?.invoiceNo ?? null,
      total: invoice?.total ?? null,
      href: workflowHrefs.invoice,
    },
    completionReport: {
      linked: Boolean(completionReportId),
      completionReportId,
      href: workflowHrefs.completion,
    },
    photos: {
      surveyCount: surveyPhotos.length,
      completionCount: completionPhotos.length,
    },
    documents: listProjectPdfsV1(projectId),
    fieldOpsHref: `/projects-v1?projectId=${encodeURIComponent(projectId)}&source=business`,
    workflowCards: buildWorkflowCardsV2({
      projectId,
      surveyProjectId,
      surveyHref: workflowHrefs.survey,
      drawingHref: workflowHrefs.drawing,
      estimateHref: workflowHrefs.estimate,
      invoiceHref: workflowHrefs.invoice,
      completionHref: workflowHrefs.completion,
    }),
    nextActions: buildNextActionsV1({
      projectId,
      estimateHref: workflowHrefs.estimate,
      invoiceHref: workflowHrefs.invoice,
      completionHref: workflowHrefs.completion,
      surveyHref: workflowHrefs.survey,
      qnapSyncStatus: String(row.qnap_sync_status ?? "pending"),
    }),
    documentsStatus: getProjectDocumentsStatusV1(projectId),
    timeline: listProjectTimelineV2(projectId),
    shareHistory: listPdfShareHistoryV2(projectId),
    projectStatus: getProjectStatusV1(projectId),
    operational,
    checklist: buildOperationalChecklistV1({
      projectId,
      surveyProjectId,
      hasEstimate: Boolean(estimateId),
      hasInvoice: Boolean(invoiceId),
    }),
    profit: buildProjectProfitSummaryV1({ estimateId, invoiceId }),
    pdfCenter: buildProjectPdfCenterV1(projectId),
    automation: (() => {
      const bundle = getProjectAutomationBundleV1(projectId);
      return {
        ...bundle,
        suggestions: refreshAiSuggestionsV1(projectId, {
          tasks: bundle.tasks,
          tools: bundle.tools,
          photos: bundle.photos,
        }),
      };
    })(),
  };
}

export function createProjectMgmtV1(input: {
  title: string;
  customerName: string;
  phone?: string;
  address?: string;
  municipality?: string;
  assignee?: string;
  cityCode?: string;
  customerId?: string;
  surveyProjectId?: string;
  mgmtStatus?: ProjectMgmtStatus;
  templateId?: string;
}): BusinessProject {
  const id = `BIZ-${uuid().slice(0, 8).toUpperCase()}`;
  const cityCode = resolveCityCodeForProject({
    municipality: input.municipality,
    address: input.address,
    cityCode: input.cityCode,
  });
  const projectNo = allocateProjectNoV1(cityCode);
  const now = new Date().toISOString();
  const customerId = input.customerId?.trim() || `CUST-${uuid().slice(0, 8).toUpperCase()}`;
  const municipality = input.municipality?.trim() ?? "";
  const qnapFolderPath = buildQnapFolderPathV1(projectNo);
  const businessStatus = input.mgmtStatus
    ? mgmtStatusToBusinessStatus(input.mgmtStatus)
    : "new";

  getDatabase()
    .prepare(
      `INSERT INTO business_projects (
        id, project_no, customer_id, customer_name, title, address, phone, status,
        municipality, assignee, qnap_folder_path, qnap_sync_status,
        survey_schedule_json, survey_memo, survey_photos_json, estimate_id,
        construction_schedule_json, required_materials, construction_memo, construction_photos_json,
        completion_report_id, invoice_id, payment_due_date, paid_date, qnap_base_path,
        survey_project_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending',
        NULL, '', '[]', NULL, NULL, '', '', '[]', NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
    )
    .run(
      id,
      projectNo,
      customerId,
      input.customerName.trim(),
      input.title.trim(),
      input.address?.trim() ?? "",
      input.phone?.trim() ?? "",
      businessStatus,
      municipality,
      input.assignee?.trim() ?? "",
      qnapFolderPath,
      qnapFolderPath,
      input.surveyProjectId ?? null,
      now,
      now
    );

  const created = getBusinessProject(id)!;
  try {
    createProjectStorageFoldersV1(id);
  } catch (e) {
    console.error("[project-mgmt-v1] project storage folders:", e);
  }
  appendProjectTimeline({
    projectId: id,
    eventType: "project_created",
    detail: `${created.projectNo} ${created.title}`,
    actor: "project_mgmt",
  });
  addProjectTimelineEventV1({
    projectId: id,
    eventType: "project_created",
    title: "案件作成",
    description: `${created.projectNo} ${created.title}`,
  });
  if (input.surveyProjectId) {
    addProjectTimelineEventV1({
      projectId: id,
      eventType: "survey_created",
      title: "現調作成",
      description: input.surveyProjectId,
    });
    syncProjectStatusAutoV1(id, "survey_saved");
  }
  if (input.templateId?.trim()) {
    try {
      applyProjectTemplateV1(id, input.templateId.trim());
      addProjectTimelineEventV1({
        projectId: id,
        eventType: "template_applied",
        title: "案件テンプレート適用",
        description: input.templateId.trim(),
      });
    } catch (e) {
      console.error("[project-mgmt-v1] template apply:", e);
    }
  }
  onBusinessProjectCreatedV1(id);
  return created;
}

export function updateProjectMgmtV1(
  projectId: string,
  patch: Partial<{
    title: string;
    customerName: string;
    phone: string;
    address: string;
    municipality: string;
    assignee: string;
    mgmtStatus: ProjectMgmtStatus;
  }>
): BusinessProject | null {
  const existing = getBusinessProject(projectId);
  if (!existing) return null;

  const prevMgmtStatus = deriveProjectStatusFromRowV1(
    getDatabase()
      .prepare(
        `SELECT id, status, estimate_id, invoice_id, paid_date, survey_project_id,
                survey_schedule_json, construction_schedule_json, updated_at
         FROM business_projects WHERE id = ?`
      )
      .get(projectId) as Record<string, unknown>
  );
  const prevAssignee = String(
    (
      getDatabase()
        .prepare(`SELECT assignee FROM business_projects WHERE id = ?`)
        .get(projectId) as { assignee?: string } | undefined
    )?.assignee ?? ""
  );

  const businessPatch: Parameters<typeof updateBusinessProject>[1] = {};
  if (patch.title !== undefined) businessPatch.title = patch.title;
  if (patch.customerName !== undefined) businessPatch.customerName = patch.customerName;
  if (patch.phone !== undefined) businessPatch.phone = patch.phone;
  if (patch.address !== undefined) businessPatch.address = patch.address;
  if (patch.mgmtStatus !== undefined) {
    businessPatch.status = mgmtStatusToBusinessStatus(patch.mgmtStatus);
  }

  if (Object.keys(businessPatch).length > 0) {
    updateBusinessProject(projectId, businessPatch, { skipTransitionCheck: true });
  }

  const extra: string[] = [];
  const params: unknown[] = [];
  if (patch.municipality !== undefined) {
    extra.push("municipality = ?");
    params.push(patch.municipality.trim());
  }
  if (patch.assignee !== undefined) {
    extra.push("assignee = ?");
    params.push(patch.assignee.trim());
  }
  if (extra.length > 0) {
    extra.push("updated_at = datetime('now')");
    getDatabase()
      .prepare(`UPDATE business_projects SET ${extra.join(", ")} WHERE id = ?`)
      .run(...params, projectId);
  }

  const updated = getBusinessProject(projectId);
  if (updated) {
    const changes: string[] = [];
    if (patch.title !== undefined && patch.title !== existing.title) changes.push("案件名");
    if (patch.customerName !== undefined && patch.customerName !== existing.customerName)
      changes.push("顧客名");
    if (patch.mgmtStatus !== undefined && patch.mgmtStatus !== prevMgmtStatus) {
      addProjectTimelineEventV1({
        projectId,
        eventType: "status_changed",
        title: "ステータス変更",
        description: `${PROJECT_MGMT_STATUS_LABELS[prevMgmtStatus]} → ${PROJECT_MGMT_STATUS_LABELS[patch.mgmtStatus]}`,
      });
    }
    if (patch.assignee !== undefined && patch.assignee.trim() !== prevAssignee.trim()) {
      addProjectTimelineEventV1({
        projectId,
        eventType: "assignee_changed",
        title: "担当変更",
        description: `${prevAssignee || "—"} → ${patch.assignee.trim() || "—"}`,
      });
    }
    if (changes.length) {
      addProjectTimelineEventV1({
        projectId,
        eventType: "project_updated",
        title: "案件更新",
        description: changes.join("・"),
      });
    }
  }

  return updated;
}

export function softDeleteProjectMgmtV1(projectId: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT id FROM business_projects WHERE id = ? AND deleted_at IS NULL`)
    .get(projectId);
  if (!row) return false;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(`UPDATE business_projects SET deleted_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, projectId);
  softDeleteAllProjectPdfMeta(projectId);
  return true;
}

export { listProjectCityCodesV1 };

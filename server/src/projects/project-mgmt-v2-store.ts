/** 案件親データ運用 v2 — ダッシュボードカード・KPI・複合検索・履歴 */

import { getDatabase } from "../db/database.js";
import { listSurveyPhotosV1 } from "../survey/survey-v1-store.js";
import { listPdfShareLogsForProjectV1 } from "./pdf-share-log-store.js";
import {
  deriveProjectStatusFromRowV1,
  PROJECT_MGMT_STATUS_LABELS,
  type ProjectMgmtStatus,
} from "./project-mgmt-status-v1.js";
import {
  PROJECT_STATUS_COLOR_GROUP_V1,
  projectStatusMatchesFilterV1,
} from "./project-status-v1.js";
import { listProjectTimeline } from "../toms/project-timeline.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";
import type { ProjectMgmtListItemV1 } from "./project-mgmt-v1-store.js";
import { getProjectAutomationBundleV1 } from "./project-automation-v1-store.js";
import {
  backfillProjectTimelineV1,
  formatTimelineDateGroupV1,
  formatTimelineDateTimeV1,
  listProjectTimelineEventsV1,
  markRetroactiveBackfillFlagsV1,
} from "./project-timeline-v1-store.js";
import { listProjectStorageV1 } from "../storage/project-storage-v1.js";
import { getBusinessProject } from "../business/business-store.js";

export interface NextActionItemV1 {
  key: string;
  label: string;
  icon: string;
  href: string | null;
  tab: string | null;
}

export type WorkflowCardState = "not_created" | "created" | "updated" | "photos_missing";

export interface WorkflowCardV2 {
  key: "survey" | "estimate" | "invoice" | "specification" | "completion";
  label: string;
  state: WorkflowCardState;
  stateLabel: string;
  stateIcon: string;
  href: string | null;
  summary: string;
}

export interface ProjectTimelineItemV2 {
  id: string;
  date: string;
  dateGroup: string;
  title: string;
  detail: string;
  eventType: string;
  category: string;
  createdAt: string;
  isBackfill: boolean;
}

export interface PdfShareHistoryItemV2 {
  id: string;
  documentLabel: string;
  sharedAt: string;
  channelLabel: string;
  fileName: string;
}

export interface ProjectMgmtKpiV2 {
  monthLabel: string;
  projectsThisMonth: number;
  estimatesSubmitted: number;
  ordersWon: number;
  invoicedCount: number;
  unpaidCount: number;
  orderRatePercent: number | null;
}

const SHARE_KIND_LABELS: Record<string, string> = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  completion: "完了報告書",
  "completion-report": "完了報告書",
  report: "完了報告書",
};

const STATE_PRESENTATION: Record<WorkflowCardState, { label: string; icon: string }> = {
  not_created: { label: "未作成", icon: "⚠️" },
  created: { label: "作成済", icon: "✅" },
  updated: { label: "更新あり", icon: "🔄" },
  photos_missing: { label: "写真不足", icon: "📷" },
};

function cardStateFromDocStatus(code: string): WorkflowCardState {
  if (code === "ready") return "created";
  if (code === "not_created") return "not_created";
  if (code === "photos_missing" || code === "completion_photos_missing") return "photos_missing";
  return "updated";
}

export function buildWorkflowCardsV2(input: {
  projectId: string;
  surveyProjectId: string | null;
  surveyHref: string | null;
  estimateHref: string | null;
  invoiceHref: string | null;
  completionHref: string | null;
}): WorkflowCardV2[] {
  const docStatus = getProjectDocumentsStatusV1(input.projectId);
  const docMap = new Map(docStatus?.documents.map((d) => [d.kind, d]) ?? []);

  const surveyPhotos = input.surveyProjectId
    ? listSurveyPhotosV1(input.surveyProjectId).length
    : 0;
  let surveyState: WorkflowCardState = "not_created";
  if (input.surveyProjectId) {
    const specStale = docMap.get("specification")?.stale;
    if (!surveyPhotos) surveyState = "photos_missing";
    else if (specStale) surveyState = "updated";
    else surveyState = "created";
  }

  const specDoc = docMap.get("specification");
  const estDoc = docMap.get("estimate");
  const invDoc = docMap.get("invoice");
  const compDoc = docMap.get("completion");

  const specHref = input.surveyProjectId
    ? `/document-viewer-v1.html?projectId=${encodeURIComponent(input.projectId)}&kind=specification`
    : null;

  const cards: Array<Omit<WorkflowCardV2, "stateLabel" | "stateIcon">> = [
    {
      key: "survey",
      label: "現調",
      state: surveyState,
      href: input.surveyHref,
      summary: input.surveyProjectId ? `写真 ${surveyPhotos} 枚` : "未連携",
    },
    {
      key: "estimate",
      label: "見積",
      state: estDoc ? cardStateFromDocStatus(estDoc.status) : "not_created",
      href: input.estimateHref,
      summary: estDoc?.hasPdf ? "PDFあり" : estDoc?.status === "not_created" ? "未作成" : "下書き",
    },
    {
      key: "invoice",
      label: "請求",
      state: invDoc ? cardStateFromDocStatus(invDoc.status) : "not_created",
      href: input.invoiceHref,
      summary: invDoc?.hasPdf ? "PDFあり" : "未作成",
    },
    {
      key: "specification",
      label: "仕様書",
      state: specDoc ? cardStateFromDocStatus(specDoc.status) : "not_created",
      href: specHref,
      summary: specDoc?.hasPdf ? "PDFあり" : "未作成",
    },
    {
      key: "completion",
      label: "完了報告",
      state: compDoc ? cardStateFromDocStatus(compDoc.status) : "not_created",
      href: input.completionHref,
      summary: compDoc?.hasPdf ? "PDFあり" : "未作成",
    },
  ];

  return cards.map((c) => {
    const pres = STATE_PRESENTATION[c.state];
    return { ...c, stateLabel: pres.label, stateIcon: pres.icon };
  });
}

export function buildNextActionsV1(input: {
  projectId: string;
  estimateHref: string;
  invoiceHref: string;
  completionHref: string;
  surveyHref: string | null;
  qnapSyncStatus: string;
}): NextActionItemV1[] {
  const actions: NextActionItemV1[] = [];
  const docStatus = getProjectDocumentsStatusV1(input.projectId);
  const docMap = new Map(docStatus?.documents.map((d) => [d.kind, d]) ?? []);

  let storageDocs: ReturnType<typeof listProjectStorageV1>["documents"] = [];
  try {
    storageDocs = listProjectStorageV1(input.projectId).documents;
  } catch {
    /* project storage unavailable */
  }

  const est = docMap.get("estimate");
  if (!est || est.status === "not_created") {
    actions.push({
      key: "estimate_not_created",
      label: "見積未作成",
      icon: "⚠️",
      href: input.estimateHref,
      tab: "estimate",
    });
  }

  const inv = docMap.get("invoice");
  if (!inv || inv.status === "not_created") {
    actions.push({
      key: "invoice_not_created",
      label: "請求未作成",
      icon: "⚠️",
      href: input.invoiceHref,
      tab: "invoice",
    });
  }

  if (storageDocs.some((d) => d.hasLocalPdf && d.saveStatus !== "saved")) {
    actions.push({
      key: "pdf_unsaved",
      label: "PDF未保存",
      icon: "🟡",
      href: null,
      tab: "files",
    });
  }

  if (input.qnapSyncStatus !== "synced") {
    actions.push({
      key: "qnap_unsaved",
      label: "QNAP未保存",
      icon: "🟡",
      href: null,
      tab: "files",
    });
  }

  const spec = docMap.get("specification");
  const comp = docMap.get("completion");
  const bizProject = getBusinessProject(input.projectId);
  const surveyPhotoCount = bizProject?.surveyProjectId
    ? listSurveyPhotosV1(bizProject.surveyProjectId).length
    : 0;
  if (
    spec?.status === "photos_missing" ||
    comp?.status === "completion_photos_missing" ||
    (bizProject?.surveyProjectId && surveyPhotoCount === 0)
  ) {
    actions.push({
      key: "photos_missing",
      label: "写真不足",
      icon: "📷",
      href: input.surveyHref,
      tab: "photos",
    });
  }

  if (!comp || comp.status === "not_created") {
    actions.push({
      key: "completion_not_created",
      label: "完了報告未作成",
      icon: "⚠️",
      href: input.completionHref,
      tab: "completion",
    });
  }

  return actions;
}

export function listProjectTimelineV2(projectId: string): ProjectTimelineItemV2[] {
  backfillProjectTimelineV1(projectId);
  markRetroactiveBackfillFlagsV1(projectId);
  const v1Events = listProjectTimelineEventsV1(projectId);
  if (v1Events.length > 0) {
    return v1Events.map((e) => ({
      id: e.id,
      date: formatTimelineDateTimeV1(e.createdAt),
      dateGroup: formatTimelineDateGroupV1(e.createdAt),
      title: e.title,
      detail: e.description,
      eventType: e.eventType,
      category: e.category,
      createdAt: e.createdAt,
      isBackfill: e.isBackfill,
    }));
  }
  return listProjectTimeline(projectId)
    .slice()
    .reverse()
    .map((e) => ({
      id: e.id,
      date: formatTimelineDateTimeV1(e.createdAt),
      dateGroup: formatTimelineDateGroupV1(e.createdAt),
      title: e.title,
      detail: e.detail,
      eventType: e.eventType,
      category: "general",
      createdAt: e.createdAt,
      isBackfill: false,
    }));
}

export function listPdfShareHistoryV2(projectId: string): PdfShareHistoryItemV2[] {
  return listPdfShareLogsForProjectV1(projectId).map((log) => ({
    id: log.id,
    documentLabel: SHARE_KIND_LABELS[log.documentKind] ?? log.documentKind,
    sharedAt: log.sharedAt,
    channelLabel: "LINE共有",
    fileName: log.fileName,
  }));
}

export interface ProjectMgmtSearchFiltersV2 {
  q?: string;
  customerName?: string;
  projectNo?: string;
  municipality?: string;
  assignee?: string;
  status?: ProjectMgmtStatus;
  limit?: number;
}

function matchesField(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return haystack.toLowerCase().includes(n);
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

export function listProjectMgmtV2(filters?: ProjectMgmtSearchFiltersV2): ProjectMgmtListItemV1[] {
  const limit = filters?.limit ?? 200;
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
    .filter((r) => {
      const q = filters?.q?.trim();
      if (q) {
        const fields = [
          String(r.project_no ?? ""),
          String(r.customer_name ?? ""),
          String(r.address ?? ""),
          String(r.title ?? ""),
          String(r.municipality ?? ""),
          String(r.assignee ?? ""),
        ];
        if (!fields.some((f) => f.toLowerCase().includes(q.toLowerCase()))) return false;
      }
      if (!matchesField(String(r.customer_name ?? ""), filters?.customerName ?? "")) return false;
      if (!matchesField(String(r.project_no ?? ""), filters?.projectNo ?? "")) return false;
      if (!matchesField(String(r.municipality ?? ""), filters?.municipality ?? "")) return false;
      if (!matchesField(String(r.assignee ?? ""), filters?.assignee ?? "")) return false;
      return true;
    })
    .filter((r) => {
      if (!filters?.status) return true;
      return projectStatusMatchesFilterV1(r, filters.status);
    })
    .map((r) => {
      const item = rowToListItem(r);
      let automation: ProjectMgmtListItemV1["automation"] = null;
      try {
        const bundle = getProjectAutomationBundleV1(item.id);
        if (bundle.tasks.length || bundle.tools.length || bundle.photos.length) {
          automation = {
            tasksPercent: bundle.progress.tasks.percent,
            toolsPercent: bundle.progress.tools.percent,
            photosPercent: bundle.progress.photos.percent,
            documentsPercent: bundle.progress.documents.percent,
          };
        }
      } catch {
        /* optional */
      }
      return { ...item, automation };
    });
}

function monthBoundsJst(now = new Date()): { start: string; end: string; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const label = `${y}年${m + 1}月`;
  return { start: start.toISOString(), end: end.toISOString(), label };
}

const ORDERED_STATUSES: ProjectMgmtStatus[] = [
  "ordered",
  "construction_scheduled",
  "construction_in_progress",
  "completion_report_creating",
  "awaiting_invoice",
  "invoiced",
  "awaiting_payment",
  "completed",
];

const ESTIMATE_SUBMITTED_STATUSES: ProjectMgmtStatus[] = [
  "estimate_submitted",
  ...ORDERED_STATUSES,
];

export function getProjectMgmtKpiV2(now = new Date()): ProjectMgmtKpiV2 {
  const { start, end, label } = monthBoundsJst(now);
  const rows = getDatabase()
    .prepare(
      `SELECT id, status, invoice_id, paid_date, estimate_id, survey_project_id,
              survey_schedule_json, construction_schedule_json, created_at
       FROM business_projects WHERE deleted_at IS NULL`
    )
    .all() as Array<Record<string, unknown>>;

  let projectsThisMonth = 0;
  let estimatesSubmitted = 0;
  let ordersWon = 0;
  let invoicedCount = 0;
  let unpaidCount = 0;

  for (const r of rows) {
    const createdAt = String(r.created_at ?? "");
    const inMonth = createdAt >= start && createdAt <= end;
    if (inMonth) projectsThisMonth += 1;

    const mgmt = deriveProjectStatusFromRowV1(r);

    if (ESTIMATE_SUBMITTED_STATUSES.includes(mgmt) && Boolean(r.estimate_id) && inMonth) {
      estimatesSubmitted += 1;
    }
    if (ORDERED_STATUSES.includes(mgmt) && inMonth) ordersWon += 1;
    if ((mgmt === "invoiced" || mgmt === "awaiting_payment" || mgmt === "completed") && inMonth) {
      invoicedCount += 1;
    }
    if ((mgmt === "invoiced" || mgmt === "awaiting_payment") && inMonth) unpaidCount += 1;
  }

  const orderRatePercent =
    estimatesSubmitted > 0 ? Math.round((ordersWon / estimatesSubmitted) * 1000) / 10 : null;

  return {
    monthLabel: label,
    projectsThisMonth,
    estimatesSubmitted,
    ordersWon,
    invoicedCount,
    unpaidCount,
    orderRatePercent,
  };
}

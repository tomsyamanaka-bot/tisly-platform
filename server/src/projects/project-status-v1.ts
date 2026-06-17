/**
 * 案件ステータス自動化 v1 — 13段階の標準ステータスと自動判定
 */
import { getDatabase } from "../db/database.js";
import { getLatestWorkSessionForProject } from "../field-ops/work-session-v1-store.js";
import { findLinkByProject } from "../schedule/google-calendar-sync-store.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";

export const PROJECT_STATUSES_V1 = [
  "inquiry",
  "survey_scheduled",
  "survey_done",
  "estimate_creating",
  "estimate_submitted",
  "ordered",
  "construction_scheduled",
  "construction_in_progress",
  "completion_report_creating",
  "awaiting_invoice",
  "invoiced",
  "awaiting_payment",
  "completed",
] as const;

export type ProjectStatusV1 = (typeof PROJECT_STATUSES_V1)[number];

export type ProjectStatusColorGroupV1 =
  | "gray"
  | "blue"
  | "yellow"
  | "green"
  | "orange"
  | "purple";

export const PROJECT_STATUS_LABELS_V1: Record<ProjectStatusV1, string> = {
  inquiry: "問い合わせ",
  survey_scheduled: "現調予定",
  survey_done: "現調完了",
  estimate_creating: "見積作成中",
  estimate_submitted: "見積提出済",
  ordered: "受注",
  construction_scheduled: "施工予定",
  construction_in_progress: "施工中",
  completion_report_creating: "完了報告作成中",
  awaiting_invoice: "請求待ち",
  invoiced: "請求済",
  awaiting_payment: "入金待ち",
  completed: "完了",
};

export const PROJECT_STATUS_COLOR_GROUP_V1: Record<ProjectStatusV1, ProjectStatusColorGroupV1> = {
  inquiry: "gray",
  survey_scheduled: "blue",
  survey_done: "blue",
  estimate_creating: "yellow",
  estimate_submitted: "yellow",
  ordered: "green",
  construction_scheduled: "orange",
  construction_in_progress: "orange",
  completion_report_creating: "purple",
  awaiting_invoice: "purple",
  invoiced: "purple",
  awaiting_payment: "purple",
  completed: "green",
};

export const PROJECT_STATUS_COLOR_HEX_V1: Record<ProjectStatusColorGroupV1, string> = {
  gray: "#64748b",
  blue: "#2563eb",
  yellow: "#ca8a04",
  green: "#16a34a",
  orange: "#ea580c",
  purple: "#7c3aed",
};

const ORDERED_BUSINESS_STATUSES = new Set([
  "accepted",
  "ordered",
  "construction_scheduled",
  "construction_done",
  "completion_report_created",
  "invoice_created",
  "invoice_sent",
  "invoice_sent_to_owner",
  "payment_scheduled",
  "partial_paid",
  "invoiced",
  "paid",
  "closed",
]);

const WORK_COMPLETED_STATUSES = new Set([
  "construction_done",
  "completion_report_created",
  "invoice_created",
  "invoice_sent",
  "invoice_sent_to_owner",
  "payment_scheduled",
  "partial_paid",
  "invoiced",
]);

const AWAITING_PAYMENT_STATUSES = new Set([
  "invoice_sent",
  "invoice_sent_to_owner",
  "payment_scheduled",
  "invoiced",
  "partial_paid",
]);

export interface ProjectStatusSignalsV1 {
  businessStatus: string;
  hasEstimate: boolean;
  hasInvoice: boolean;
  hasPaidDate: boolean;
  hasCompletionReportPdf: boolean;
  hasWorkCompleted: boolean;
  hasActiveWorkSession: boolean;
  hasGoogleCalendarEvent: boolean;
  isOrdered: boolean;
  hasSurveyScheduled: boolean;
  isSurveyDone: boolean;
}

export interface ProjectStatusResultV1 {
  status: ProjectStatusV1;
  statusLabel: string;
  statusColor: ProjectStatusColorGroupV1;
  statusColorHex: string;
  updatedAt: string;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function hasScheduleDate(jsonRaw: unknown): boolean {
  const schedule = parseJson<{ date?: string } | null>(jsonRaw, null);
  const date = schedule?.date?.trim();
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
}

export function buildProjectStatusSignalsV1(input: {
  projectId: string;
  businessStatus?: string;
  estimateId?: string | null;
  invoiceId?: string | null;
  paidDate?: string | null;
  surveyProjectId?: string | null;
  surveyScheduleJson?: unknown;
  constructionScheduleJson?: unknown;
  updatedAt?: string;
}): ProjectStatusSignalsV1 {
  const businessStatus = String(input.businessStatus ?? "new");
  const st = businessStatus.toLowerCase();
  const hasEstimate = Boolean(input.estimateId);
  const hasInvoice = Boolean(input.invoiceId);
  const hasPaidDate = Boolean(input.paidDate?.trim());

  const session = getLatestWorkSessionForProject({
    source: "business",
    projectId: input.projectId,
  });
  const hasActiveWorkSession = Boolean(
    session && (session.arrivalTime || session.startTime) && !session.completionTime
  );
  const hasWorkCompleted = Boolean(
    session?.completionTime || WORK_COMPLETED_STATUSES.has(st)
  );

  const docStatus = getProjectDocumentsStatusV1(input.projectId);
  const completionDoc = docStatus?.documents.find((d) => d.kind === "completion");
  const hasCompletionReportPdf = Boolean(completionDoc?.hasPdf);

  const hasGoogleCalendarEvent =
    Boolean(findLinkByProject({ source: "business", projectId: input.projectId })) ||
    hasScheduleDate(input.constructionScheduleJson);

  const hasSurveyScheduled =
    hasScheduleDate(input.surveyScheduleJson) ||
    st === "survey_scheduled" ||
    st === "surveying";

  const isSurveyDone =
    st === "survey_done" ||
    (Boolean(input.surveyProjectId) &&
      ["survey_done", "estimate_created", "estimate_sent"].includes(st));

  const isOrdered = ORDERED_BUSINESS_STATUSES.has(st);

  return {
    businessStatus,
    hasEstimate,
    hasInvoice,
    hasPaidDate,
    hasCompletionReportPdf,
    hasWorkCompleted,
    hasActiveWorkSession,
    hasGoogleCalendarEvent,
    isOrdered,
    hasSurveyScheduled,
    isSurveyDone,
  };
}

/** 自動判定 — 下位から順に上書き（最終段階が優先） */
export function deriveProjectStatusV1(signals: ProjectStatusSignalsV1): ProjectStatusV1 {
  let status: ProjectStatusV1 = "inquiry";

  if (signals.hasSurveyScheduled) status = "survey_scheduled";
  if (signals.isSurveyDone) status = "survey_done";

  const pastSurvey =
    signals.isSurveyDone ||
    signals.hasEstimate ||
    signals.isOrdered ||
    signals.hasWorkCompleted;

  if (pastSurvey && !signals.hasEstimate) status = "estimate_creating";
  if (signals.hasEstimate) status = "estimate_submitted";
  if (signals.isOrdered) status = "ordered";
  if (signals.hasGoogleCalendarEvent) status = "construction_scheduled";
  if (signals.hasActiveWorkSession) status = "construction_in_progress";
  if (signals.hasWorkCompleted && !signals.hasCompletionReportPdf) {
    status = "completion_report_creating";
  }
  if (signals.hasCompletionReportPdf) status = "awaiting_invoice";
  if (signals.hasInvoice) {
    status = AWAITING_PAYMENT_STATUSES.has(signals.businessStatus.toLowerCase())
      ? "awaiting_payment"
      : "invoiced";
  }
  if (signals.hasPaidDate) status = "completed";

  return status;
}

export function toProjectStatusResultV1(
  status: ProjectStatusV1,
  updatedAt: string
): ProjectStatusResultV1 {
  const color = PROJECT_STATUS_COLOR_GROUP_V1[status];
  return {
    status,
    statusLabel: PROJECT_STATUS_LABELS_V1[status],
    statusColor: color,
    statusColorHex: PROJECT_STATUS_COLOR_HEX_V1[color],
    updatedAt,
  };
}

export function getProjectStatusV1(projectId: string): ProjectStatusResultV1 | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, status, estimate_id, invoice_id, paid_date, survey_project_id,
              survey_schedule_json, construction_schedule_json, updated_at
       FROM business_projects WHERE id = ? AND deleted_at IS NULL`
    )
    .get(projectId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const signals = buildProjectStatusSignalsV1({
    projectId,
    businessStatus: String(row.status ?? "new"),
    estimateId: row.estimate_id != null ? String(row.estimate_id) : null,
    invoiceId: row.invoice_id != null ? String(row.invoice_id) : null,
    paidDate: row.paid_date != null ? String(row.paid_date) : null,
    surveyProjectId: row.survey_project_id != null ? String(row.survey_project_id) : null,
    surveyScheduleJson: row.survey_schedule_json,
    constructionScheduleJson: row.construction_schedule_json,
    updatedAt: String(row.updated_at ?? ""),
  });

  const status = deriveProjectStatusV1(signals);
  return toProjectStatusResultV1(status, String(row.updated_at ?? new Date().toISOString()));
}

export function deriveProjectStatusFromRowV1(row: Record<string, unknown>): ProjectStatusV1 {
  const projectId = String(row.id);
  const signals = buildProjectStatusSignalsV1({
    projectId,
    businessStatus: String(row.status ?? "new"),
    estimateId: row.estimate_id != null ? String(row.estimate_id) : null,
    invoiceId: row.invoice_id != null ? String(row.invoice_id) : null,
    paidDate: row.paid_date != null ? String(row.paid_date) : null,
    surveyProjectId: row.survey_project_id != null ? String(row.survey_project_id) : null,
    surveyScheduleJson: row.survey_schedule_json,
    constructionScheduleJson: row.construction_schedule_json,
    updatedAt: String(row.updated_at ?? ""),
  });
  return deriveProjectStatusV1(signals);
}

export function isValidProjectStatusV1(s: string): s is ProjectStatusV1 {
  return (PROJECT_STATUSES_V1 as readonly string[]).includes(s);
}

export function projectStatusMatchesFilterV1(
  row: Record<string, unknown>,
  filter: ProjectStatusV1
): boolean {
  return deriveProjectStatusFromRowV1(row) === filter;
}

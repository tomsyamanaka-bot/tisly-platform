/**
 * 実運用フェーズ1 — 案件の簡易ステータス（7段階）と進捗バー
 */
import { getDatabase } from "../db/database.js";
import type { ProjectMgmtStatus } from "./project-mgmt-status-v1.js";
import { getProjectDocumentsStatusV1 } from "./project-documents-v1.js";

export const OPERATIONAL_STATUSES_V1 = [
  "not_started",
  "surveying",
  "estimate_submitted",
  "ordered",
  "construction",
  "completed",
  "invoiced",
] as const;

export type OperationalStatusV1 = (typeof OPERATIONAL_STATUSES_V1)[number];

export const OPERATIONAL_STATUS_LABELS_V1: Record<OperationalStatusV1, string> = {
  not_started: "未着手",
  surveying: "現調中",
  estimate_submitted: "見積提出",
  ordered: "受注",
  construction: "施工中",
  completed: "完了",
  invoiced: "請求済",
};

export const OPERATIONAL_STATUS_COLORS_V1: Record<OperationalStatusV1, string> = {
  not_started: "#64748b",
  surveying: "#2563eb",
  estimate_submitted: "#ca8a04",
  ordered: "#16a34a",
  construction: "#ea580c",
  completed: "#7c3aed",
  invoiced: "#15803d",
};

export const OPERATIONAL_PROGRESS_STEPS_V1 = [
  { key: "created", label: "案件作成" },
  { key: "survey", label: "現調" },
  { key: "drawing", label: "図面" },
  { key: "estimate", label: "見積" },
  { key: "ordered", label: "受注" },
  { key: "construction", label: "施工" },
  { key: "completion", label: "完了報告" },
  { key: "invoice", label: "請求" },
] as const;

export type OperationalProgressStepKeyV1 = (typeof OPERATIONAL_PROGRESS_STEPS_V1)[number]["key"];

export interface OperationalProgressStepV1 {
  key: OperationalProgressStepKeyV1;
  label: string;
  done: boolean;
  current: boolean;
}

export interface OperationalProgressV1 {
  percent: number;
  doneCount: number;
  total: number;
  currentStep: OperationalProgressStepKeyV1;
  currentLabel: string;
  steps: OperationalProgressStepV1[];
}

export interface OperationalStatusBundleV1 {
  status: OperationalStatusV1;
  statusLabel: string;
  statusColor: string;
  progress: OperationalProgressV1;
}

const MGMT_TO_OPERATIONAL: Record<ProjectMgmtStatus, OperationalStatusV1> = {
  inquiry: "not_started",
  survey_scheduled: "surveying",
  survey_done: "surveying",
  estimate_creating: "surveying",
  estimate_submitted: "estimate_submitted",
  ordered: "ordered",
  construction_scheduled: "ordered",
  construction_in_progress: "construction",
  completion_report_creating: "construction",
  awaiting_invoice: "completed",
  invoiced: "invoiced",
  awaiting_payment: "invoiced",
  completed: "invoiced",
};

export function deriveOperationalStatusV1(
  mgmtStatus: ProjectMgmtStatus,
  opts?: { hasCompletionPdf?: boolean }
): OperationalStatusV1 {
  if (opts?.hasCompletionPdf) return "completed";
  return MGMT_TO_OPERATIONAL[mgmtStatus] ?? "not_started";
}

function docReady(projectId: string, kind: string): boolean {
  const docs = getProjectDocumentsStatusV1(projectId);
  const doc = docs?.documents.find((d) => d.kind === kind);
  if (!doc) return false;
  return doc.hasPdf || doc.status === "ready";
}

function hasDrawing(_projectId: string, surveyProjectId: string | null): boolean {
  if (!surveyProjectId) return false;
  try {
    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM survey_drawing_sketches WHERE project_id = ?`)
      .get(surveyProjectId) as { c?: number } | undefined;
    return Number(row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

export function buildOperationalProgressV1(input: {
  projectId: string;
  mgmtStatus: ProjectMgmtStatus;
  surveyProjectId: string | null;
  hasEstimate: boolean;
  hasInvoice: boolean;
  isOrdered: boolean;
  hasWorkCompleted: boolean;
}): OperationalProgressV1 {
  const created = true;
  const survey = Boolean(input.surveyProjectId);
  const drawing = hasDrawing(input.projectId, input.surveyProjectId);
  const estimate = input.hasEstimate || docReady(input.projectId, "estimate");
  const ordered = input.isOrdered;
  const construction =
    input.mgmtStatus === "construction_in_progress" ||
    input.mgmtStatus === "completion_report_creating" ||
    input.hasWorkCompleted ||
    input.mgmtStatus === "awaiting_invoice" ||
    input.mgmtStatus === "invoiced" ||
    input.mgmtStatus === "awaiting_payment" ||
    input.mgmtStatus === "completed";
  const completion = docReady(input.projectId, "completion") || input.hasWorkCompleted;
  const invoice = input.hasInvoice || docReady(input.projectId, "invoice");

  const flags: Record<OperationalProgressStepKeyV1, boolean> = {
    created,
    survey,
    drawing,
    estimate,
    ordered,
    construction,
    completion,
    invoice,
  };

  const keys = OPERATIONAL_PROGRESS_STEPS_V1.map((s) => s.key);
  let currentStep: OperationalProgressStepKeyV1 = "created";
  for (const key of keys) {
    if (!flags[key]) {
      currentStep = key;
      break;
    }
    currentStep = key;
  }
  if (keys.every((k) => flags[k])) currentStep = "invoice";

  const doneCount = keys.filter((k) => flags[k]).length;
  const total = keys.length;
  const percent = Math.round((doneCount / total) * 100);

  const steps: OperationalProgressStepV1[] = OPERATIONAL_PROGRESS_STEPS_V1.map((s) => ({
    key: s.key,
    label: s.label,
    done: flags[s.key],
    current: s.key === currentStep && !flags[s.key],
  }));

  const currentLabel =
    OPERATIONAL_PROGRESS_STEPS_V1.find((s) => s.key === currentStep)?.label ?? "案件作成";

  return { percent, doneCount, total, currentStep, currentLabel, steps };
}

export function buildOperationalStatusBundleV1(input: {
  projectId: string;
  mgmtStatus: ProjectMgmtStatus;
  surveyProjectId: string | null;
  hasEstimate: boolean;
  hasInvoice: boolean;
  isOrdered: boolean;
  hasWorkCompleted: boolean;
  hasCompletionPdf?: boolean;
}): OperationalStatusBundleV1 {
  const status = deriveOperationalStatusV1(input.mgmtStatus, {
    hasCompletionPdf: input.hasCompletionPdf,
  });
  return {
    status,
    statusLabel: OPERATIONAL_STATUS_LABELS_V1[status],
    statusColor: OPERATIONAL_STATUS_COLORS_V1[status],
    progress: buildOperationalProgressV1(input),
  };
}

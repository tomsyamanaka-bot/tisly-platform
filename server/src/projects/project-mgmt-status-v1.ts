/** 案件管理基盤 v1 — 表示用ステータス（business_projects.status から導出） */

import type { BusinessProjectStatus } from "../business/business-types.js";

export const PROJECT_MGMT_STATUSES = [
  "inquiry",
  "survey_scheduled",
  "estimate_submitted",
  "ordered",
  "construction_scheduled",
  "construction_in_progress",
  "work_completed",
  "invoiced",
  "paid",
] as const;

export type ProjectMgmtStatus = (typeof PROJECT_MGMT_STATUSES)[number];

export const PROJECT_MGMT_STATUS_LABELS: Record<ProjectMgmtStatus, string> = {
  inquiry: "問い合わせ",
  survey_scheduled: "現調予定",
  estimate_submitted: "見積提出",
  ordered: "受注",
  construction_scheduled: "施工予定",
  construction_in_progress: "施工中",
  work_completed: "完了",
  invoiced: "請求済",
  paid: "入金済",
};

const STATUS_TO_MGMT: Record<string, ProjectMgmtStatus> = {
  new: "inquiry",
  surveying: "survey_scheduled",
  survey_scheduled: "survey_scheduled",
  survey_done: "survey_scheduled",
  estimate_pending: "survey_scheduled",
  estimate_created: "estimate_submitted",
  estimate_sent: "estimate_submitted",
  estimate_sent_to_owner: "estimate_submitted",
  accepted: "ordered",
  ordered: "ordered",
  construction_scheduled: "construction_scheduled",
  construction_done: "work_completed",
  completion_report_created: "work_completed",
  completed: "work_completed",
  invoice_created: "invoiced",
  invoice_sent: "invoiced",
  invoice_sent_to_owner: "invoiced",
  partial_paid: "invoiced",
  payment_scheduled: "invoiced",
  invoiced: "invoiced",
  paid: "paid",
  closed: "paid",
  archived: "paid",
};

export function deriveMgmtStatus(
  businessStatus: string,
  opts?: { hasActiveWorkSession?: boolean; hasInvoice?: boolean; hasPaid?: boolean }
): ProjectMgmtStatus {
  if (opts?.hasPaid) return "paid";
  if (opts?.hasInvoice && !opts?.hasPaid) {
    const base = STATUS_TO_MGMT[businessStatus.toLowerCase()] ?? "invoiced";
    if (base === "paid") return "paid";
    return "invoiced";
  }
  if (opts?.hasActiveWorkSession) return "construction_in_progress";
  return STATUS_TO_MGMT[businessStatus.toLowerCase()] ?? "inquiry";
}

export function mgmtStatusMatchesFilter(
  businessStatus: string,
  filter: ProjectMgmtStatus,
  opts?: { hasActiveWorkSession?: boolean; hasInvoice?: boolean; hasPaid?: boolean }
): boolean {
  return deriveMgmtStatus(businessStatus, opts) === filter;
}

export function isValidMgmtStatus(s: string): s is ProjectMgmtStatus {
  return (PROJECT_MGMT_STATUSES as readonly string[]).includes(s);
}

export function mgmtStatusToBusinessStatus(status: ProjectMgmtStatus): BusinessProjectStatus {
  const map: Record<ProjectMgmtStatus, BusinessProjectStatus> = {
    inquiry: "new",
    survey_scheduled: "survey_scheduled",
    estimate_submitted: "estimate_sent",
    ordered: "accepted",
    construction_scheduled: "construction_scheduled",
    construction_in_progress: "construction_scheduled",
    work_completed: "construction_done",
    invoiced: "invoice_sent",
    paid: "paid",
  };
  return map[status];
}

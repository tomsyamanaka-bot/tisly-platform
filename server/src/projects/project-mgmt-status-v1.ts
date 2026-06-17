/** @deprecated 互換レイヤ — 新規は project-status-v1 を直接使用 */

import type { BusinessProjectStatus } from "../business/business-types.js";
import {
  deriveProjectStatusFromRowV1,
  deriveProjectStatusV1,
  buildProjectStatusSignalsV1,
  isValidProjectStatusV1,
  PROJECT_STATUS_LABELS_V1,
  PROJECT_STATUSES_V1,
  type ProjectStatusV1,
} from "./project-status-v1.js";

export const PROJECT_MGMT_STATUSES = PROJECT_STATUSES_V1;
export type ProjectMgmtStatus = ProjectStatusV1;
export const PROJECT_MGMT_STATUS_LABELS = PROJECT_STATUS_LABELS_V1;

export function deriveMgmtStatus(
  businessStatus: string,
  opts?: { hasActiveWorkSession?: boolean; hasInvoice?: boolean; hasPaid?: boolean }
): ProjectMgmtStatus {
  const signals = buildProjectStatusSignalsV1({
    projectId: "__derive__",
    businessStatus,
    invoiceId: opts?.hasInvoice ? "x" : null,
    paidDate: opts?.hasPaid ? "2020-01-01" : null,
  });
  if (opts?.hasActiveWorkSession) {
    return deriveProjectStatusV1({ ...signals, hasActiveWorkSession: true });
  }
  return deriveProjectStatusV1(signals);
}

export function mgmtStatusMatchesFilter(
  businessStatus: string,
  filter: ProjectMgmtStatus,
  opts?: { hasActiveWorkSession?: boolean; hasInvoice?: boolean; hasPaid?: boolean }
): boolean {
  return deriveMgmtStatus(businessStatus, opts) === filter;
}

export function isValidMgmtStatus(s: string): s is ProjectMgmtStatus {
  return isValidProjectStatusV1(s);
}

export function mgmtStatusToBusinessStatus(status: ProjectMgmtStatus): BusinessProjectStatus {
  const map: Partial<Record<ProjectMgmtStatus, BusinessProjectStatus>> = {
    inquiry: "new",
    survey_scheduled: "survey_scheduled",
    survey_done: "survey_done",
    estimate_creating: "survey_done",
    estimate_submitted: "estimate_sent",
    ordered: "accepted",
    construction_scheduled: "construction_scheduled",
    construction_in_progress: "construction_scheduled",
    completion_report_creating: "construction_done",
    awaiting_invoice: "construction_done",
    invoiced: "invoice_created",
    awaiting_payment: "invoice_sent",
    completed: "paid",
  };
  return map[status] ?? "new";
}

export { deriveProjectStatusFromRowV1 };

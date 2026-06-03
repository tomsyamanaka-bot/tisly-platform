import type { BusinessProject, BusinessProjectStatus } from "./business-types.js";

export interface NextAction {
  label: string;
  hrefSuffix: string;
}

const NEXT_ACTIONS: Partial<Record<BusinessProjectStatus, NextAction>> = {
  new: { label: "現調予定を入れる", hrefSuffix: "/survey" },
  survey_scheduled: { label: "現調内容を入力する", hrefSuffix: "/survey" },
  survey_done: { label: "見積を作る", hrefSuffix: "/estimate" },
  estimate_created: { label: "確認用メールを作る", hrefSuffix: "/estimate" },
  estimate_sent_to_owner: { label: "受注にする", hrefSuffix: "" },
  accepted: { label: "工事日を入れる", hrefSuffix: "/construction" },
  construction_scheduled: { label: "施工写真を撮る", hrefSuffix: "/construction" },
  construction_done: { label: "完了報告書と請求書を作る", hrefSuffix: "/completion-report" },
  completion_report_created: { label: "請求書を作る", hrefSuffix: "/invoice" },
  invoice_created: { label: "入金予定日を入れる", hrefSuffix: "/payment" },
  invoice_sent_to_owner: { label: "入金予定日を入れる", hrefSuffix: "/payment" },
  payment_scheduled: { label: "入金済みにする", hrefSuffix: "/payment" },
};

const ALLOWED_TRANSITIONS: Partial<Record<BusinessProjectStatus, BusinessProjectStatus[]>> = {
  new: ["survey_scheduled", "archived"],
  survey_scheduled: ["survey_done", "survey_scheduled", "archived"],
  survey_done: ["estimate_created", "survey_scheduled"],
  estimate_created: ["estimate_sent_to_owner", "accepted", "estimate_created"],
  estimate_sent_to_owner: ["accepted", "estimate_created"],
  accepted: ["construction_scheduled"],
  construction_scheduled: ["construction_done", "construction_scheduled"],
  construction_done: ["completion_report_created", "invoice_created"],
  completion_report_created: ["invoice_created"],
  invoice_created: ["invoice_sent_to_owner", "payment_scheduled", "invoice_created"],
  invoice_sent_to_owner: ["payment_scheduled"],
  payment_scheduled: ["paid"],
  paid: ["archived"],
  archived: [],
};

export function getNextAction(project: BusinessProject): NextAction | null {
  const base = `/business/projects/${project.id}`;
  const action = NEXT_ACTIONS[project.status];
  if (!action) return null;
  return { label: action.label, hrefSuffix: `${base}${action.hrefSuffix}` };
}

export function canTransitionStatus(
  from: BusinessProjectStatus,
  to: BusinessProjectStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

export function assertTransition(
  from: BusinessProjectStatus,
  to: BusinessProjectStatus
): void {
  if (!canTransitionStatus(from, to)) {
    throw new Error(`Invalid status transition: ${from} → ${to}`);
  }
}

export function statusAfterSurveySchedule(): BusinessProjectStatus {
  return "survey_scheduled";
}

export function statusAfterSurveyDone(): BusinessProjectStatus {
  return "survey_done";
}

export function statusAfterEstimateCreated(): BusinessProjectStatus {
  return "estimate_created";
}

export function statusAfterEstimateMail(): BusinessProjectStatus {
  return "estimate_sent_to_owner";
}

export function statusAfterAccepted(): BusinessProjectStatus {
  return "accepted";
}

export function statusAfterConstructionSchedule(): BusinessProjectStatus {
  return "construction_scheduled";
}

export function statusAfterConstructionDone(): BusinessProjectStatus {
  return "construction_done";
}

export function statusAfterCompletionReport(): BusinessProjectStatus {
  return "completion_report_created";
}

export function statusAfterInvoiceCreated(): BusinessProjectStatus {
  return "invoice_created";
}

export function statusAfterInvoiceSent(): BusinessProjectStatus {
  return "invoice_sent_to_owner";
}

export function statusAfterPaymentScheduled(): BusinessProjectStatus {
  return "payment_scheduled";
}

export function statusAfterPaid(): BusinessProjectStatus {
  return "paid";
}

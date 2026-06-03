import type { BusinessProject, BusinessProjectStatus } from "./business-types.js";

export interface NextAction {
  label: string;
  hrefSuffix: string;
}

/** DBに残る旧ステータス → Phase541 正規ステータス */
const LEGACY_STATUS_MAP: Record<string, BusinessProjectStatus> = {
  estimate_sent_to_owner: "estimate_sent",
  accepted: "estimate_sent",
  invoice_sent_to_owner: "invoice_sent",
  payment_scheduled: "invoice_sent",
  archived: "closed",
};

export function normalizeProjectStatus(raw: string): BusinessProjectStatus {
  return (LEGACY_STATUS_MAP[raw] ?? raw) as BusinessProjectStatus;
}

const NEXT_ACTIONS: Partial<Record<BusinessProjectStatus, NextAction>> = {
  new: { label: "現調予定を入れる", hrefSuffix: "/survey" },
  survey_scheduled: { label: "現調内容を入力する", hrefSuffix: "/survey" },
  survey_done: { label: "見積を作る", hrefSuffix: "/estimate" },
  estimate_created: { label: "見積送付メールを作る", hrefSuffix: "/estimate" },
  estimate_sent: { label: "工事日を入れる", hrefSuffix: "/construction" },
  construction_scheduled: { label: "施工写真を撮る", hrefSuffix: "/construction" },
  construction_done: { label: "完了報告書を作る", hrefSuffix: "/completion-report" },
  completion_report_created: { label: "請求書を作る", hrefSuffix: "/invoice" },
  invoice_created: { label: "請求送付メールを作る", hrefSuffix: "/invoice" },
  invoice_sent: { label: "入金を記録する", hrefSuffix: "/payment" },
  partial_paid: { label: "残入金を記録する", hrefSuffix: "/payment" },
  paid: { label: "案件をクローズ", hrefSuffix: "/payment" },
};

const ALLOWED_TRANSITIONS: Partial<Record<BusinessProjectStatus, BusinessProjectStatus[]>> = {
  new: ["survey_scheduled", "closed"],
  survey_scheduled: ["survey_done", "survey_scheduled", "closed"],
  survey_done: ["estimate_created", "survey_scheduled"],
  estimate_created: ["estimate_sent", "estimate_created", "construction_scheduled"],
  estimate_sent: ["construction_scheduled", "estimate_created"],
  construction_scheduled: ["construction_done", "construction_scheduled"],
  construction_done: ["completion_report_created", "invoice_created"],
  completion_report_created: ["invoice_created"],
  invoice_created: ["invoice_sent", "invoice_created"],
  invoice_sent: ["partial_paid", "paid"],
  partial_paid: ["paid", "partial_paid", "invoice_sent"],
  paid: ["closed"],
  closed: [],
};

export function getNextAction(project: BusinessProject): NextAction | null {
  const base = `/business/projects/${project.id}`;
  const status = normalizeProjectStatus(project.status);
  const action = NEXT_ACTIONS[status];
  if (!action) return null;
  return { label: action.label, hrefSuffix: `${base}${action.hrefSuffix}` };
}

export function canTransitionStatus(
  from: BusinessProjectStatus | string,
  to: BusinessProjectStatus | string
): boolean {
  const f = normalizeProjectStatus(String(from));
  const t = normalizeProjectStatus(String(to));
  if (f === t) return true;
  const allowed = ALLOWED_TRANSITIONS[f];
  return allowed?.includes(t) ?? false;
}

export function assertTransition(
  from: BusinessProjectStatus | string,
  to: BusinessProjectStatus | string
): void {
  const f = normalizeProjectStatus(String(from));
  const t = normalizeProjectStatus(String(to));
  if (!canTransitionStatus(f, t)) {
    throw new Error(`Invalid status transition: ${f} → ${t}`);
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
  return "estimate_sent";
}

export function statusAfterAccepted(): BusinessProjectStatus {
  return "estimate_sent";
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
  return "invoice_sent";
}

export function statusAfterPaymentScheduled(): BusinessProjectStatus {
  return "invoice_sent";
}

export function statusAfterPaid(): BusinessProjectStatus {
  return "paid";
}

export function statusAfterClosed(): BusinessProjectStatus {
  return "closed";
}

/** hub-counts / フィルタ用: 正規＋旧ステータスを展開 */
export function expandStatusAliases(statuses: BusinessProjectStatus[]): string[] {
  const out = new Set<string>(statuses);
  for (const s of statuses) {
    if (s === "estimate_sent") {
      out.add("estimate_sent_to_owner");
      out.add("accepted");
    }
    if (s === "invoice_sent") {
      out.add("invoice_sent_to_owner");
      out.add("payment_scheduled");
    }
    if (s === "closed") out.add("archived");
  }
  return [...out];
}

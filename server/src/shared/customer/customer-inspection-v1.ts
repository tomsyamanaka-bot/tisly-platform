/**
 * 点検期限判定 — 30日前 / 14日前 / 7日前 / 期限切れ
 */

export type CustomerInspectionUrgencyV1 = "ok" | "warn30" | "warn14" | "warn7" | "overdue" | "none";

export type CustomerInspectionColorV1 = "green" | "yellow" | "red" | "gray";

export interface CustomerInspectionStatusV1 {
  urgency: CustomerInspectionUrgencyV1;
  color: CustomerInspectionColorV1;
  label: string;
  daysUntil: number | null;
}

function parseDateOnly(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function classifyInspectionDeadlineV1(
  nextInspectionDate: string | null | undefined
): CustomerInspectionStatusV1 {
  const target = parseDateOnly(nextInspectionDate);
  if (!target) {
    return { urgency: "none", color: "gray", label: "点検予定未定", daysUntil: null };
  }
  const today = startOfToday();
  const msPerDay = 86_400_000;
  const daysUntil = Math.ceil((target.getTime() - today.getTime()) / msPerDay);

  if (daysUntil < 0) {
    return { urgency: "overdue", color: "red", label: "点検期限切れ", daysUntil };
  }
  if (daysUntil <= 7) {
    return { urgency: "warn7", color: "red", label: `点検まで${daysUntil}日`, daysUntil };
  }
  if (daysUntil <= 14) {
    return { urgency: "warn14", color: "yellow", label: `点検まで${daysUntil}日`, daysUntil };
  }
  if (daysUntil <= 30) {
    return { urgency: "warn30", color: "yellow", label: `点検まで${daysUntil}日`, daysUntil };
  }
  return { urgency: "ok", color: "green", label: "点検予定まで余裕あり", daysUntil };
}

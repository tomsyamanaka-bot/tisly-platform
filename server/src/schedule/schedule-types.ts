/** TiSLY 日程調整 PWA v1 — 型定義 */

export type ScheduleCategory = "construction" | "office" | "family" | "urgent";

export type ScheduleEventSource = "mock" | "google" | "manual";

export interface ScheduleEvent {
  id: string;
  date: string;
  title: string;
  category: ScheduleCategory;
  source: ScheduleEventSource;
  /** 将来 Google Calendar 連携用 */
  externalId?: string | null;
}

export interface UnavailableDay {
  id: string;
  date: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface DayAvailability {
  stars: string;
  label: string;
  level: "free" | "light" | "busy" | "full" | "unavailable";
}

export interface ScheduleDayCard {
  date: string;
  weekday: string;
  weekdayIndex: number;
  eventCount: number;
  events: ScheduleEvent[];
  unavailable: UnavailableDay | null;
  availability: DayAvailability;
}

export interface ScheduleWeekView {
  offset: number;
  label: string;
  startDate: string;
  endDate: string;
  days: ScheduleDayCard[];
  summary: ScheduleWeekSummary;
}

export interface ScheduleWeekSummary {
  constructionCount: number;
  officeCount: number;
  familyCount: number;
  unavailableDays: number;
  freeDays: number;
  totalEvents: number;
}

export interface ScheduleThreeWeekBlock {
  startDate: string;
  endDate: string;
  label: string;
  constructionCount: number;
  totalEvents: number;
}

export interface ScheduleMonthDayCell {
  date: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  categories: Array<{ category: ScheduleCategory; icon: string; label: string; count: number }>;
  extraCount: number;
  events: ScheduleEvent[];
  unavailable: UnavailableDay | null;
}

export interface ScheduleMonthView {
  year: number;
  month: number;
  label: string;
  weeks: ScheduleMonthDayCell[][];
}

export const SCHEDULE_CATEGORY_META: Record<
  ScheduleCategory,
  { icon: string; label: string; color: string }
> = {
  construction: { icon: "🟫", label: "工事", color: "#8b6914" },
  office: { icon: "🟦", label: "事務", color: "#2563eb" },
  family: { icon: "🟩", label: "家族", color: "#16a34a" },
  urgent: { icon: "🟥", label: "重要", color: "#dc2626" },
};

export const UNAVAILABLE_REASON_PRESETS = [
  "事務処理",
  "家族予定",
  "材料待ち",
  "移動不可",
  "電話対応のみ",
] as const;

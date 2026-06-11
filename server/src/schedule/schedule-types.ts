/** TiSLY 日程調整 PWA v1 — 型定義 */

import type { DayDispatch } from "./route-planner-service.js";
import type { DayTravelBlock, MapsIntegrationStatus } from "./google-maps-service.js";
import type { DayWeather } from "./weather-service.js";
import type { ScheduleDayDepartureV1 } from "./schedule-day-departures-store.js";

export type ScheduleCategory = "construction" | "office" | "family" | "urgent";

export type ScheduleEventSource = "mock" | "google" | "manual";

export interface ScheduleEvent {
  id: string;
  date: string;
  title: string;
  category: ScheduleCategory;
  source: ScheduleEventSource;
  externalId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  /** Google Calendar 同期元カレンダー ID */
  calendarId?: string | null;
  /** Google Calendar の backgroundColor（例: #9a6324） */
  calendarColor?: string | null;
  /** Google Calendar の表示名 */
  calendarSummary?: string | null;
}

export interface UnavailableDay {
  id: string;
  date: string;
  reason: string;
  detailMemo: string;
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
  departure?: ScheduleDayDepartureV1 | null;
  firstConstructionEventId?: string | null;
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
  days: ScheduleDayCard[];
}

export interface CalendarIntegrationStatus {
  label:
    | "未設定"
    | "未設定（mock）"
    | "仮連携中"
    | "本番連携済み"
    | "要OAuth接続"
    | "設定済み・未ログイン"
    | "Googleログイン済み"
    | "同期成功"
    | "同期失敗";
  mode: "mock" | "live";
  configured: boolean;
  connected: boolean;
}

export interface ScheduleDaySiteStop {
  projectId: string;
  projectSource: "survey" | "business";
  title: string;
  address?: string;
}

export interface ScheduleDayDetail {
  day: ScheduleDayCard;
  weather: DayWeather;
  dispatch: DayDispatch | null;
  travelBlocks: DayTravelBlock[];
  mapsIntegration: MapsIntegrationStatus;
  memo?: string | null;
  eventRemark?: string | null;
  mapsUrl?: string | null;
  departure?: ScheduleDayDepartureV1 | null;
  siteStops?: ScheduleDaySiteStop[];
  workSessions?: import("../field-ops/field-ops-types.js").WorkSessionV1[];
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

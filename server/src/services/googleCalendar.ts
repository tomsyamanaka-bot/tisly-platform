/**
 * Google Calendar 連携準備レイヤー（現時点はモック）
 * 将来: OAuth + Calendar API で mockCalendarEvents を差し替え
 */

import type { ScheduleCategory, ScheduleEvent, ScheduleEventSource } from "../schedule/schedule-types.js";

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  calendarId: string;
}

/** 人間が後で設定する仮値 */
export const GOOGLE_CALENDAR_CONFIG_PLACEHOLDER: GoogleCalendarConfig = {
  clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "PLACEHOLDER_CLIENT_ID",
  clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "PLACEHOLDER_CLIENT_SECRET",
  redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? "https://tisly.jp/api/schedule/v1/oauth/callback",
  calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
};

export interface CalendarProvider {
  listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]>;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOffset(base: Date): string {
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

/** デモ用モック予定（週によって少し変化） */
export function mockCalendarEvents(startDate: string, endDate: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const seed = startDate.replace(/-/g, "").length;

  const templates: Array<{ title: string; category: ScheduleCategory; wd: number }> = [
    { title: "防犯カメラ設置", category: "construction", wd: 1 },
    { title: "インターホン交換", category: "construction", wd: 2 },
    { title: "見積書まとめ", category: "office", wd: 2 },
    { title: "請求・入金確認", category: "office", wd: 3 },
    { title: "家族の予定", category: "family", wd: 5 },
    { title: "緊急対応", category: "urgent", wd: 4 },
    { title: "LAN配線工事", category: "construction", wd: 3 },
    { title: "現調（大阪）", category: "construction", wd: 1 },
  ];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    templates.forEach((tpl, i) => {
      if (tpl.wd !== wd) return;
      if ((seed + i + d.getDate()) % 3 === 0) return;
      events.push({
        id: `mock-${iso}-${i}`,
        date: iso,
        title: tpl.title,
        category: tpl.category,
        source: "mock" as ScheduleEventSource,
        externalId: null,
      });
    });
    if (d.getDate() % 7 === 0 && seed % 2 === 0) {
      events.push({
        id: `mock-extra-${iso}`,
        date: iso,
        title: "追加工事",
        category: "construction",
        source: "mock",
      });
    }
  }
  return events;
}

export class MockGoogleCalendarProvider implements CalendarProvider {
  async listEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]> {
    return mockCalendarEvents(startDate, endDate);
  }
}

let provider: CalendarProvider = new MockGoogleCalendarProvider();

export function setCalendarProvider(p: CalendarProvider): void {
  provider = p;
}

export function getCalendarProvider(): CalendarProvider {
  return provider;
}

export async function fetchCalendarEvents(startDate: string, endDate: string): Promise<ScheduleEvent[]> {
  return provider.listEvents(startDate, endDate);
}

export function getWeekStartWithOffset(offsetWeeks = 0): string {
  const now = new Date();
  const monday = weekdayOffset(now);
  return addDays(monday, offsetWeeks * 7);
}

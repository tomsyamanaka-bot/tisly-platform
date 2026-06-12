/** Field Operations UI v2 — 案件ホーム用ダッシュボード集計 */

import { getDatabase } from "../db/database.js";
import { countProjectsByStatus } from "../business/business-store.js";
import { getTodayDepartureSummary } from "../schedule/schedule-day-departures-store.js";
import {
  countMonthCompletions,
  countTodayCompletions,
  countTodayConstructionInProgress,
} from "../field-ops/work-session-v1-store.js";

export interface FieldOpsDashboardCardV1 {
  id: string;
  label: string;
  count: number;
  href: string;
  themeColor: string;
}

export interface TodayDepartureCardV1 {
  departureTime: string;
  reminderTime: string;
  reminderEnabled: boolean;
  eventTitle: string | null;
  fieldCheckUrl: string | null;
}

export interface FieldOpsDashboardV1 {
  cards: FieldOpsDashboardCardV1[];
  todayDeparture: TodayDepartureCardV1 | null;
  generatedAt: string;
}

function countFieldCheckIncomplete(): number {
  const rows = getDatabase()
    .prepare(
      `SELECT project_source, project_id,
              COUNT(*) as total,
              SUM(checked) as checked
       FROM field_check_items
       GROUP BY project_source, project_id
       HAVING total > 0 AND checked < total`
    )
    .all() as Array<{ total: number; checked: number }>;
  return rows.length;
}

function countPurchaseByStatus(status: string): number {
  const row = getDatabase()
    .prepare(`SELECT COUNT(DISTINCT project_source || ':' || project_id) as c FROM purchase_lines WHERE status = ?`)
    .get(status) as { c: number };
  return row?.c ?? 0;
}

function countTodaySites(): number {
  const today = new Date().toISOString().slice(0, 10);
  const survey = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM survey_projects
       WHERE survey_date = ? OR (workflow_status = 'surveying' AND date(updated_at) = date('now'))`
    )
    .get(today) as { c: number };
  const biz = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM business_projects
       WHERE status IN ('survey_scheduled', 'construction_scheduled')
       AND (survey_schedule_json LIKE ? OR construction_schedule_json LIKE ?)`
    )
    .get(`%"date":"${today}"%`, `%"date":"${today}"%`) as { c: number };
  return (survey?.c ?? 0) + (biz?.c ?? 0);
}

export function buildFieldOpsDashboardV1(): FieldOpsDashboardV1 {
  const cards: FieldOpsDashboardCardV1[] = [
    {
      id: "today_sites",
      label: "今日の現場",
      count: countTodaySites(),
      href: "/schedule-v1",
      themeColor: "#e8a54b",
    },
    {
      id: "today_construction",
      label: "今日の施工中",
      count: countTodayConstructionInProgress(),
      href: "/projects-v1",
      themeColor: "#d97706",
    },
    {
      id: "today_completed",
      label: "今日の完了",
      count: countTodayCompletions(),
      href: "/projects-v1",
      themeColor: "#16a34a",
    },
    {
      id: "month_completed",
      label: "今月完了",
      count: countMonthCompletions(),
      href: "/projects-v1",
      themeColor: "#059669",
    },
    {
      id: "field_check_short",
      label: "材料未チェック",
      count: countFieldCheckIncomplete(),
      href: "/field-check-v1",
      themeColor: "#7c5cbf",
    },
    {
      id: "purchase_pending",
      label: "発注待ち",
      count: countPurchaseByStatus("pending"),
      href: "/purchase-v1",
      themeColor: "#c45b2c",
    },
    {
      id: "purchase_received",
      label: "入荷待ち",
      count: countPurchaseByStatus("ordered"),
      href: "/purchase-v1?filter=ordered",
      themeColor: "#4a90d9",
    },
    {
      id: "invoice_pending",
      label: "請求待ち",
      count: countProjectsByStatus([
        "construction_done",
        "completion_report_created",
        "invoice_created",
      ]),
      href: "/estimate-v1",
      themeColor: "#0969da",
    },
    {
      id: "payment_pending",
      label: "入金待ち",
      count: countProjectsByStatus(["payment_scheduled", "invoice_sent_to_owner", "invoice_sent"]),
      href: "/estimate-v1",
      themeColor: "#0d9488",
    },
  ];
  return { cards, todayDeparture: null, generatedAt: new Date().toISOString() };
}

export async function buildFieldOpsDashboardV1Async(): Promise<FieldOpsDashboardV1> {
  const base = buildFieldOpsDashboardV1();
  const departure = await getTodayDepartureSummary();
  if (!departure) {
    return base;
  }
  return {
    ...base,
    todayDeparture: {
      departureTime: departure.departureTime,
      reminderTime: departure.reminderTime,
      reminderEnabled: departure.reminderEnabled,
      eventTitle: departure.eventTitle,
      fieldCheckUrl: departure.fieldCheckUrl,
    },
  };
}

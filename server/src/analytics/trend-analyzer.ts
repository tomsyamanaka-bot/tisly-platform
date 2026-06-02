import { getDatabase } from "../db/database.js";

export interface TrendPoint {
  label: string;
  count: number;
}

export interface TrendReport {
  period: "today" | "week" | "month";
  totalEvents: number;
  anomalyCount: number;
  byHour: TrendPoint[];
  byType: TrendPoint[];
  bySite: TrendPoint[];
  peakHour: string | null;
  topEventType: string | null;
}

function periodSql(period: "today" | "week" | "month"): string {
  if (period === "today") return "datetime('now', '-1 day')";
  if (period === "week") return "datetime('now', '-7 days')";
  return "datetime('now', '-30 days')";
}

export function analyzeTrends(period: "today" | "week" | "month" = "today"): TrendReport {
  const db = getDatabase();
  const since = periodSql(period);

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM events WHERE created_at >= ${since}`)
      .get() as { c: number }
  ).c;

  const anomaly = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM events WHERE created_at >= ${since}
         AND severity IN ('alarm', 'critical', 'warning')`
      )
      .get() as { c: number }
  ).c;

  const byHour = db
    .prepare(
      `SELECT strftime('%H', created_at) as label, COUNT(*) as count
       FROM events WHERE created_at >= ${since}
       GROUP BY label ORDER BY label`
    )
    .all() as TrendPoint[];

  const byType = db
    .prepare(
      `SELECT event_type as label, COUNT(*) as count
       FROM events WHERE created_at >= ${since}
       GROUP BY event_type ORDER BY count DESC LIMIT 10`
    )
    .all() as TrendPoint[];

  const bySite = db
    .prepare(
      `SELECT COALESCE(site_id, 'unknown') as label, COUNT(*) as count
       FROM events WHERE created_at >= ${since}
       GROUP BY site_id ORDER BY count DESC LIMIT 10`
    )
    .all() as TrendPoint[];

  const peak = byHour.reduce(
    (best, p) => (p.count > (best?.count ?? 0) ? p : best),
    null as TrendPoint | null
  );

  return {
    period,
    totalEvents: total,
    anomalyCount: anomaly,
    byHour,
    byType,
    bySite,
    peakHour: peak ? `${peak.label}:00` : null,
    topEventType: byType[0]?.label ?? null,
  };
}

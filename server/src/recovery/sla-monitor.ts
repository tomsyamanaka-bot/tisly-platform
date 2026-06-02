import { getDatabase } from "../db/database.js";

export interface SlaMetrics {
  uptimePercent: number;
  recoveryRatePercent: number;
  mttrMinutes: number;
  periodDays: number;
  totalIncidents: number;
  recoveredIncidents: number;
}

export function computeMttr(periodDays = 30): number {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT opened_at, closed_at FROM incidents
       WHERE status = 'closed' AND closed_at IS NOT NULL
       AND opened_at >= datetime('now', ?)`
    )
    .all(`-${periodDays} days`) as Array<{
    opened_at: string;
    closed_at: string;
  }>;

  if (rows.length === 0) return 0;

  let totalMin = 0;
  for (const r of rows) {
    const open = new Date(r.opened_at).getTime();
    const close = new Date(r.closed_at).getTime();
    totalMin += (close - open) / 60000;
  }
  return Math.round((totalMin / rows.length) * 10) / 10;
}

export function getSlaMetrics(periodDays = 30): SlaMetrics {
  const db = getDatabase();
  const since = `-${periodDays} days`;

  const devices = (
    db.prepare(`SELECT COUNT(*) as c FROM devices`).get() as { c: number }
  ).c;
  const okDevices = (
    db
      .prepare(`SELECT COUNT(*) as c FROM devices WHERE heartbeat_status = 'ok'`)
      .get() as { c: number }
  ).c;

  const uptimePercent =
    devices > 0 ? Math.round((okDevices / devices) * 1000) / 10 : 100;

  const totalIncidents = (
    db
      .prepare(`SELECT COUNT(*) as c FROM incidents WHERE opened_at >= datetime('now', ?)`)
      .get(since) as { c: number }
  ).c;

  const recoveredIncidents = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM incidents WHERE status = 'closed' AND opened_at >= datetime('now', ?)`
      )
      .get(since) as { c: number }
  ).c;

  const recoveryRatePercent =
    totalIncidents > 0
      ? Math.round((recoveredIncidents / totalIncidents) * 1000) / 10
      : 100;

  return {
    uptimePercent,
    recoveryRatePercent,
    mttrMinutes: computeMttr(periodDays),
    periodDays,
    totalIncidents,
    recoveredIncidents,
  };
}

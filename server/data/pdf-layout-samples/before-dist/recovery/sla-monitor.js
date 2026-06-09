import { getDatabase } from "../db/database.js";
export function computeMttr(periodDays = 30) {
    const db = getDatabase();
    const rows = db
        .prepare(`SELECT opened_at, closed_at FROM incidents
       WHERE status = 'closed' AND closed_at IS NOT NULL
       AND opened_at >= datetime('now', ?)`)
        .all(`-${periodDays} days`);
    if (rows.length === 0)
        return 0;
    let totalMin = 0;
    for (const r of rows) {
        const open = new Date(r.opened_at).getTime();
        const close = new Date(r.closed_at).getTime();
        totalMin += (close - open) / 60000;
    }
    return Math.round((totalMin / rows.length) * 10) / 10;
}
export function getSlaMetrics(periodDays = 30) {
    const db = getDatabase();
    const since = `-${periodDays} days`;
    const devices = db.prepare(`SELECT COUNT(*) as c FROM devices`).get().c;
    const okDevices = db
        .prepare(`SELECT COUNT(*) as c FROM devices WHERE heartbeat_status = 'ok'`)
        .get().c;
    const uptimePercent = devices > 0 ? Math.round((okDevices / devices) * 1000) / 10 : 100;
    const totalIncidents = db
        .prepare(`SELECT COUNT(*) as c FROM incidents WHERE opened_at >= datetime('now', ?)`)
        .get(since).c;
    const recoveredIncidents = db
        .prepare(`SELECT COUNT(*) as c FROM incidents WHERE status = 'closed' AND opened_at >= datetime('now', ?)`)
        .get(since).c;
    const recoveryRatePercent = totalIncidents > 0
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

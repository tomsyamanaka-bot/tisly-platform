import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export type ScheduleMode = "armed" | "disarmed" | "business" | "night";

export interface CustomerSchedule {
  id: string;
  customer_id: string;
  site_id: string | null;
  name: string;
  mode: ScheduleMode;
  cron_expr: string | null;
  time_start: string | null;
  time_end: string | null;
  days_of_week_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export function listSchedules(customerId: string): CustomerSchedule[] {
  return getDatabase()
    .prepare(`SELECT * FROM customer_schedules WHERE customer_id = ? ORDER BY name`)
    .all(customerId) as CustomerSchedule[];
}

export function createSchedule(input: {
  customerId: string;
  siteId?: string | null;
  name: string;
  mode: ScheduleMode;
  cronExpr?: string | null;
  timeStart?: string | null;
  timeEnd?: string | null;
  daysOfWeek?: number[];
  enabled?: boolean;
}): CustomerSchedule {
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO customer_schedules (id, customer_id, site_id, name, mode, cron_expr, time_start, time_end, days_of_week_json, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.customerId,
      input.siteId ?? null,
      input.name,
      input.mode,
      input.cronExpr ?? null,
      input.timeStart ?? null,
      input.timeEnd ?? null,
      JSON.stringify(input.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]),
      input.enabled !== false ? 1 : 0,
      now,
      now
    );
  return getSchedule(input.customerId, id)!;
}

export function getSchedule(customerId: string, id: string): CustomerSchedule | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_schedules WHERE customer_id = ? AND id = ?`)
    .get(customerId, id) as CustomerSchedule | undefined;
  return row ?? null;
}

export function updateSchedule(
  customerId: string,
  id: string,
  patch: Partial<{
    name: string;
    mode: ScheduleMode;
    siteId: string | null;
    cronExpr: string | null;
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: number[];
    enabled: boolean;
  }>
): CustomerSchedule | null {
  const existing = getSchedule(customerId, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE customer_schedules SET name = ?, mode = ?, site_id = ?, cron_expr = ?, time_start = ?, time_end = ?,
       days_of_week_json = ?, enabled = ?, updated_at = ? WHERE id = ? AND customer_id = ?`
    )
    .run(
      patch.name ?? existing.name,
      patch.mode ?? existing.mode,
      patch.siteId !== undefined ? patch.siteId : existing.site_id,
      patch.cronExpr !== undefined ? patch.cronExpr : existing.cron_expr,
      patch.timeStart !== undefined ? patch.timeStart : existing.time_start,
      patch.timeEnd !== undefined ? patch.timeEnd : existing.time_end,
      patch.daysOfWeek ? JSON.stringify(patch.daysOfWeek) : existing.days_of_week_json,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
      now,
      id,
      customerId
    );
  return getSchedule(customerId, id);
}

export function deleteSchedule(customerId: string, id: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM customer_schedules WHERE customer_id = ? AND id = ?`)
    .run(customerId, id);
  return r.changes > 0;
}

/** Resolve active schedule mode for a customer at a given time (simplified). */
export function resolveActiveMode(customerId: string, at = new Date()): ScheduleMode | null {
  const schedules = listSchedules(customerId).filter((s) => s.enabled === 1);
  const day = at.getDay();
  const minutes = at.getHours() * 60 + at.getMinutes();

  for (const s of schedules) {
    const days = JSON.parse(s.days_of_week_json) as number[];
    if (!days.includes(day)) continue;
    if (s.time_start && s.time_end) {
      const [sh, sm] = s.time_start.split(":").map(Number);
      const [eh, em] = s.time_end.split(":").map(Number);
      const start = sh * 60 + (sm || 0);
      const end = eh * 60 + (em || 0);
      if (start <= end) {
        if (minutes >= start && minutes < end) return s.mode;
      } else if (minutes >= start || minutes < end) {
        return s.mode;
      }
    } else {
      return s.mode;
    }
  }
  return null;
}

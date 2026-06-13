/** TiSLY 側の予定住所補正（Google カレンダーには書き戻さない） */

import { getDatabase } from "../db/database.js";

export interface ScheduleEventAddressOverride {
  scheduleEventId: string;
  address: string;
  updatedAt: string;
}

function rowToOverride(row: {
  schedule_event_id: string;
  address: string;
  updated_at: string;
}): ScheduleEventAddressOverride {
  return {
    scheduleEventId: String(row.schedule_event_id),
    address: String(row.address),
    updatedAt: String(row.updated_at),
  };
}

export function getEventAddressOverride(scheduleEventId: string): ScheduleEventAddressOverride | null {
  const id = scheduleEventId.trim();
  if (!id) return null;
  const row = getDatabase()
    .prepare(
      `SELECT schedule_event_id, address, updated_at
       FROM schedule_event_address_overrides WHERE schedule_event_id = ?`
    )
    .get(id) as
    | { schedule_event_id: string; address: string; updated_at: string }
    | undefined;
  if (!row?.address?.trim()) return null;
  return rowToOverride(row);
}

export function getEventAddressOverridesForIds(
  scheduleEventIds: string[]
): Map<string, ScheduleEventAddressOverride> {
  const ids = [...new Set(scheduleEventIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, ScheduleEventAddressOverride>();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDatabase()
    .prepare(
      `SELECT schedule_event_id, address, updated_at
       FROM schedule_event_address_overrides
       WHERE schedule_event_id IN (${placeholders})`
    )
    .all(...ids) as Array<{ schedule_event_id: string; address: string; updated_at: string }>;
  for (const row of rows) {
    if (!row.address?.trim()) continue;
    map.set(String(row.schedule_event_id), rowToOverride(row));
  }
  return map;
}

export function upsertEventAddressOverride(
  scheduleEventId: string,
  addressRaw: string
): ScheduleEventAddressOverride {
  const scheduleEventIdNorm = scheduleEventId.trim();
  const address = addressRaw.trim();
  if (!scheduleEventIdNorm) throw new Error("scheduleEventId required");
  if (!address) throw new Error("address required");
  if (address.length > 200) throw new Error("address too long");

  getDatabase()
    .prepare(
      `INSERT INTO schedule_event_address_overrides (schedule_event_id, address, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(schedule_event_id) DO UPDATE SET
         address = excluded.address,
         updated_at = excluded.updated_at`
    )
    .run(scheduleEventIdNorm, address);

  const saved = getEventAddressOverride(scheduleEventIdNorm);
  if (!saved) throw new Error("save failed");
  return saved;
}

export function deleteEventAddressOverride(scheduleEventId: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM schedule_event_address_overrides WHERE schedule_event_id = ?`)
    .run(scheduleEventId.trim());
  return r.changes > 0;
}

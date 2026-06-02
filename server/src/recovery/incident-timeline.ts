import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export type IncidentPhase = "anomaly" | "notify" | "respond" | "recover" | "close";

export interface TimelineEntry {
  id: string;
  incidentId: string;
  phase: IncidentPhase;
  title: string;
  detail?: string;
  deviceId?: string;
  siteId?: string;
  createdAt: string;
}

export function ensureIncident(deviceId: string, siteId?: string): string {
  const db = getDatabase();
  const open = db
    .prepare(
      `SELECT id FROM incidents WHERE device_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1`
    )
    .get(deviceId) as { id: string } | undefined;
  if (open) return open.id;

  const id = uuid();
  db.prepare(
    `INSERT INTO incidents (id, device_id, site_id, status, opened_at, created_at)
     VALUES (?, ?, ?, 'open', datetime('now'), datetime('now'))`
  ).run(id, deviceId, siteId ?? null);
  return id;
}

export function appendTimeline(
  incidentId: string,
  phase: IncidentPhase,
  title: string,
  detail?: string,
  deviceId?: string,
  siteId?: string
): string {
  const db = getDatabase();
  const id = uuid();
  db.prepare(
    `INSERT INTO incident_timeline (id, incident_id, phase, title, detail, device_id, site_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, incidentId, phase, title, detail ?? null, deviceId ?? null, siteId ?? null);
  return id;
}

export function getIncidentTimeline(incidentId?: string, limit = 50): TimelineEntry[] {
  const db = getDatabase();
  if (incidentId) {
    return db
      .prepare(
        `SELECT id, incident_id as incidentId, phase, title, detail, device_id as deviceId,
                site_id as siteId, created_at as createdAt
         FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC`
      )
      .all(incidentId) as TimelineEntry[];
  }
  return db
    .prepare(
      `SELECT id, incident_id as incidentId, phase, title, detail, device_id as deviceId,
              site_id as siteId, created_at as createdAt
       FROM incident_timeline ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as TimelineEntry[];
}

export function closeIncident(incidentId: string): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE incidents SET status = 'closed', closed_at = datetime('now') WHERE id = ?`
  ).run(incidentId);
  appendTimeline(incidentId, "close", "インシデントクローズ");
}

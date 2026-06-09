import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function ensureIncident(deviceId, siteId) {
    const db = getDatabase();
    const open = db
        .prepare(`SELECT id FROM incidents WHERE device_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1`)
        .get(deviceId);
    if (open)
        return open.id;
    const id = uuid();
    db.prepare(`INSERT INTO incidents (id, device_id, site_id, status, opened_at, created_at)
     VALUES (?, ?, ?, 'open', datetime('now'), datetime('now'))`).run(id, deviceId, siteId ?? null);
    return id;
}
export function appendTimeline(incidentId, phase, title, detail, deviceId, siteId) {
    const db = getDatabase();
    const id = uuid();
    db.prepare(`INSERT INTO incident_timeline (id, incident_id, phase, title, detail, device_id, site_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, incidentId, phase, title, detail ?? null, deviceId ?? null, siteId ?? null);
    return id;
}
export function getIncidentTimeline(incidentId, limit = 50) {
    const db = getDatabase();
    if (incidentId) {
        return db
            .prepare(`SELECT id, incident_id as incidentId, phase, title, detail, device_id as deviceId,
                site_id as siteId, created_at as createdAt
         FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC`)
            .all(incidentId);
    }
    return db
        .prepare(`SELECT id, incident_id as incidentId, phase, title, detail, device_id as deviceId,
              site_id as siteId, created_at as createdAt
       FROM incident_timeline ORDER BY created_at DESC LIMIT ?`)
        .all(limit);
}
export function closeIncident(incidentId) {
    const db = getDatabase();
    db.prepare(`UPDATE incidents SET status = 'closed', closed_at = datetime('now') WHERE id = ?`).run(incidentId);
    appendTimeline(incidentId, "close", "インシデントクローズ");
}

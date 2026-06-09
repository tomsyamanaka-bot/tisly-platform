import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
const ALARM_TYPES = new Set([
    "alarm",
    "intrusion",
    "perimeter",
    "estop",
    "heartbeat_alarm",
    "safety_trip",
]);
const WARNING_TYPES = new Set(["heartbeat_warning", "motion", "warning"]);
export function classifySeverity(eventType) {
    if (eventType === "critical" || eventType.endsWith("_critical"))
        return "critical";
    if (ALARM_TYPES.has(eventType) || eventType.endsWith("_alarm"))
        return "alarm";
    if (WARNING_TYPES.has(eventType) || eventType.endsWith("_warning"))
        return "warning";
    return "info";
}
export function shouldNotify(eventType) {
    if (eventType === "heartbeat" || eventType === "status" || eventType === "telemetry") {
        return false;
    }
    return true;
}
export function persistEvent(event) {
    const id = event.id ?? uuid();
    const db = getDatabase();
    const severity = event.severity ?? classifySeverity(event.eventType);
    const tenantId = event.tenantId ?? event.payload?.tenant_id ?? null;
    const siteId = event.siteId ?? event.payload?.site_id ?? null;
    const sourceType = event.sourceType ?? event.payload?.source_type ?? null;
    db.prepare(`INSERT INTO events (
      id, event_id, tenant_id, site_id, device_id, source_type, event_type, severity,
      zone, message, title, body, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      event_id = excluded.event_id,
      tenant_id = excluded.tenant_id,
      site_id = excluded.site_id,
      device_id = excluded.device_id,
      source_type = excluded.source_type,
      event_type = excluded.event_type,
      severity = excluded.severity,
      zone = excluded.zone,
      message = excluded.message,
      title = excluded.title,
      body = excluded.body,
      payload_json = excluded.payload_json,
      created_at = excluded.created_at`).run(id, id, tenantId, siteId, event.deviceId, sourceType, event.eventType, severity, event.zone ?? null, event.title, event.title, event.body ?? null, event.payload ? JSON.stringify(event.payload) : null, event.timestamp ?? new Date().toISOString());
    return id;
}
export function parseMqttPayload(topic, raw) {
    let payload = {};
    try {
        payload = JSON.parse(raw);
    }
    catch {
        payload = { value: raw };
    }
    const parts = topic.split("/").filter(Boolean);
    const deviceId = payload.deviceId ??
        payload.device_id ??
        parts[parts.length - 2] ??
        parts[parts.length - 1] ??
        "unknown";
    const eventType = payload.eventType ??
        payload.event_type ??
        parts[parts.length - 1] ??
        "event";
    if (eventType === "heartbeat") {
        return { deviceId, eventType: "heartbeat", title: "Heartbeat", payload };
    }
    const title = payload.title ??
        payload.message ??
        `TiSLY: ${eventType}`;
    const body = payload.body ?? payload.detail ?? "";
    return {
        deviceId: String(deviceId),
        eventType: String(eventType),
        title: String(title),
        body: String(body),
        payload,
        severity: classifySeverity(String(eventType)),
    };
}

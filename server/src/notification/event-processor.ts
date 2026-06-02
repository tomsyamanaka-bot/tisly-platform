import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { TislyEvent, EventSeverity } from "./types.js";

const ALARM_TYPES = new Set([
  "alarm",
  "intrusion",
  "perimeter",
  "estop",
  "heartbeat_alarm",
  "safety_trip",
]);

const WARNING_TYPES = new Set(["heartbeat_warning", "motion", "warning"]);

export function classifySeverity(eventType: string): EventSeverity {
  if (eventType === "critical" || eventType.endsWith("_critical")) return "critical";
  if (ALARM_TYPES.has(eventType) || eventType.endsWith("_alarm")) return "alarm";
  if (WARNING_TYPES.has(eventType) || eventType.endsWith("_warning")) return "warning";
  return "info";
}

export function shouldNotify(eventType: string): boolean {
  if (eventType === "heartbeat" || eventType === "status" || eventType === "telemetry") {
    return false;
  }
  return true;
}

export function persistEvent(event: TislyEvent): string {
  const id = event.id ?? uuid();
  const db = getDatabase();
  const severity = event.severity ?? classifySeverity(event.eventType);
  const tenantId =
    event.tenantId ?? (event.payload?.tenant_id as string | undefined) ?? null;
  const siteId = event.siteId ?? (event.payload?.site_id as string | undefined) ?? null;
  const sourceType =
    event.sourceType ?? (event.payload?.source_type as string | undefined) ?? null;
  db.prepare(
    `INSERT INTO events (
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
      created_at = excluded.created_at`
  ).run(
    id,
    id,
    tenantId,
    siteId,
    event.deviceId,
    sourceType,
    event.eventType,
    severity,
    event.zone ?? null,
    event.title,
    event.title,
    event.body ?? null,
    event.payload ? JSON.stringify(event.payload) : null,
    event.timestamp ?? new Date().toISOString()
  );
  return id;
}

export function parseMqttPayload(
  topic: string,
  raw: string
): TislyEvent | null {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    payload = { value: raw };
  }

  const parts = topic.split("/").filter(Boolean);
  const deviceId =
    (payload.deviceId as string) ??
    (payload.device_id as string) ??
    parts[parts.length - 2] ??
    parts[parts.length - 1] ??
    "unknown";

  const eventType =
    (payload.eventType as string) ??
    (payload.event_type as string) ??
    parts[parts.length - 1] ??
    "event";

  if (eventType === "heartbeat") {
    return { deviceId, eventType: "heartbeat", title: "Heartbeat", payload };
  }

  const title =
    (payload.title as string) ??
    (payload.message as string) ??
    `TiSLY: ${eventType}`;

  const body = (payload.body as string) ?? (payload.detail as string) ?? "";

  return {
    deviceId: String(deviceId),
    eventType: String(eventType),
    title: String(title),
    body: String(body),
    payload,
    severity: classifySeverity(String(eventType)),
  };
}

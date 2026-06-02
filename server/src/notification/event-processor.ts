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
  db.prepare(
    `INSERT INTO events (id, device_id, event_type, severity, title, body, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    event.deviceId,
    event.eventType,
    severity,
    event.title,
    event.body ?? null,
    event.payload ? JSON.stringify(event.payload) : null
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

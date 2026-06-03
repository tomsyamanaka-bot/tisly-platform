import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export type DeviceTimelineEventType =
  | "created"
  | "qr_issued"
  | "claimed"
  | "heartbeat"
  | "heartbeat_warning"
  | "heartbeat_offline"
  | "heartbeat_recovered"
  | "config_change"
  | "cert_issued"
  | "notification";

export interface DeviceTimelineEntry {
  id: string;
  deviceId: string;
  customerId: string | null;
  eventType: DeviceTimelineEventType;
  title: string;
  detail: string | null;
  actor: string | null;
  createdAt: string;
}

export function appendDeviceTimeline(input: {
  deviceId: string;
  customerId?: string;
  eventType: DeviceTimelineEventType;
  title: string;
  detail?: string;
  actor?: string;
}): DeviceTimelineEntry {
  const db = getDatabase();
  let customerId = input.customerId ?? null;
  if (!customerId) {
    const row = db
      .prepare(`SELECT customer_id FROM devices WHERE device_id = ?`)
      .get(input.deviceId) as { customer_id: string | null } | undefined;
    customerId = row?.customer_id ?? null;
  }
  const id = uuid();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO device_timeline (id, customer_id, device_id, event_type, title, detail, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    customerId,
    input.deviceId,
    input.eventType,
    input.title,
    input.detail ?? null,
    input.actor ?? null,
    createdAt
  );
  return {
    id,
    deviceId: input.deviceId,
    customerId,
    eventType: input.eventType,
    title: input.title,
    detail: input.detail ?? null,
    actor: input.actor ?? null,
    createdAt,
  };
}

export function listDeviceTimeline(
  customerId: string,
  deviceId?: string,
  limit = 100
): DeviceTimelineEntry[] {
  const db = getDatabase();
  const rows = deviceId
    ? db
        .prepare(
          `SELECT id, customer_id, device_id, event_type, title, detail, actor, created_at
           FROM device_timeline
           WHERE customer_id = ? AND device_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(customerId, deviceId, limit)
    : db
        .prepare(
          `SELECT id, customer_id, device_id, event_type, title, detail, actor, created_at
           FROM device_timeline
           WHERE customer_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(customerId, limit);

  return (rows as Array<{
    id: string;
    customer_id: string | null;
    device_id: string;
    event_type: DeviceTimelineEventType;
    title: string;
    detail: string | null;
    actor: string | null;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    customerId: r.customer_id,
    eventType: r.event_type,
    title: r.title,
    detail: r.detail,
    actor: r.actor,
    createdAt: r.created_at,
  }));
}

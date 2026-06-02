import { v4 as uuid } from "uuid";
import type { EventSeverity, TislyEvent } from "../notification/types.js";

export type SourceType =
  | "esp32"
  | "rp2350"
  | "plc"
  | "node-red"
  | "system"
  | "tv-app";

export interface UnifiedEvent {
  event_id: string;
  tenant_id: string;
  site_id: string;
  device_id: string;
  source_type: SourceType;
  event_type: string;
  severity: EventSeverity;
  zone: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function normalizeUnifiedInput(
  body: Record<string, unknown>,
  defaultTenantId: string
): UnifiedEvent {
  const eventId =
    (body.event_id as string) ??
    (body.eventId as string) ??
    uuid();
  const deviceId =
    (body.device_id as string) ??
    (body.deviceId as string) ??
    "unknown";
  const eventType =
    (body.event_type as string) ??
    (body.eventType as string) ??
    "event";
  const message =
    (body.message as string) ??
    (body.title as string) ??
    `TiSLY: ${eventType}`;
  const severity = (body.severity as EventSeverity) ?? "info";
  const createdAt =
    (body.created_at as string) ??
    (body.createdAt as string) ??
    new Date().toISOString();

  return {
    event_id: eventId,
    tenant_id: (body.tenant_id as string) ?? (body.tenantId as string) ?? defaultTenantId,
    site_id: (body.site_id as string) ?? (body.siteId as string) ?? "default",
    device_id: deviceId,
    source_type: (body.source_type as SourceType) ?? (body.sourceType as SourceType) ?? "system",
    event_type: eventType,
    severity,
    zone: (body.zone as string) ?? "",
    message,
    payload: (body.payload as Record<string, unknown>) ?? {},
    created_at: createdAt,
  };
}

export function unifiedToTislyEvent(u: UnifiedEvent): TislyEvent {
  return {
    id: u.event_id,
    deviceId: u.device_id,
    eventType: u.event_type,
    severity: u.severity,
    title: u.message,
    body: u.zone ? `zone: ${u.zone}` : undefined,
    payload: { ...u.payload, tenant_id: u.tenant_id, site_id: u.site_id, source_type: u.source_type },
    timestamp: u.created_at,
  };
}

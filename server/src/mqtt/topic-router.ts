import type { UnifiedEvent } from "../event/unified-event.js";
import { normalizeUnifiedInput } from "../event/unified-event.js";
import { config } from "../config.js";

export type MqttChannel = "event" | "state" | "heartbeat" | "recovery" | "cmd" | "unknown";

export interface ParsedTopic {
  tenantId: string;
  siteId: string;
  deviceId: string;
  channel: MqttChannel;
  rawTopic: string;
}

const TOPIC_RE =
  /^tisly\/([^/]+)\/([^/]+)\/([^/]+)\/(event|state|heartbeat|recovery|cmd)$/;

export function parseMqttTopic(topic: string): ParsedTopic | null {
  const m = topic.match(TOPIC_RE);
  if (!m) return null;
  return {
    tenantId: m[1],
    siteId: m[2],
    deviceId: m[3],
    channel: m[4] as MqttChannel,
    rawTopic: topic,
  };
}

export function mqttPayloadToUnified(
  parsed: ParsedTopic,
  payload: Record<string, unknown>
): UnifiedEvent | null {
  if (parsed.channel === "state" || parsed.channel === "cmd") {
    return null;
  }

  const sourceType =
    (payload.source_type as string) ??
    (payload.sourceType as string) ??
    inferSourceType(parsed.deviceId);

  return normalizeUnifiedInput(
    {
      ...payload,
      tenant_id: payload.tenant_id ?? payload.tenantId ?? parsed.tenantId,
      site_id: payload.site_id ?? payload.siteId ?? parsed.siteId,
      device_id: payload.device_id ?? payload.deviceId ?? parsed.deviceId,
      source_type: sourceType,
      event_type:
        payload.event_type ??
        payload.eventType ??
        (parsed.channel === "heartbeat" ? "heartbeat" : parsed.channel),
      created_at: payload.created_at ?? payload.createdAt ?? new Date().toISOString(),
    },
    config.defaultTenantId
  );
}

function inferSourceType(deviceId: string): string {
  const id = deviceId.toLowerCase();
  if (id.includes("esp")) return "esp32";
  if (id.includes("rp2350") || id.includes("rp-")) return "rp2350";
  if (id.includes("plc")) return "plc";
  if (id.startsWith("tv-")) return "tv-app";
  return "node-red";
}

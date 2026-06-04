import type { UnifiedEvent } from "../event/unified-event.js";
import { normalizeUnifiedInput } from "../event/unified-event.js";
import { config } from "../config.js";

import { parseEspMqttTopic, type EspMqttChannel } from "./esp-topic-standard.js";

export type MqttChannel = EspMqttChannel | "unknown";

export interface ParsedTopic {
  tenantId: string;
  siteId: string;
  deviceId: string;
  channel: MqttChannel;
  rawTopic: string;
  topicFormat?: "production" | "legacy" | "demo";
}

export function parseMqttTopic(topic: string): ParsedTopic | null {
  const esp = parseEspMqttTopic(topic);
  if (!esp) return null;
  return {
    tenantId: esp.customerCode,
    siteId: esp.siteId,
    deviceId: esp.deviceId,
    channel: esp.channel,
    rawTopic: esp.rawTopic,
    topicFormat: esp.format,
  };
}

export function mqttPayloadToUnified(
  parsed: ParsedTopic,
  payload: Record<string, unknown>
): UnifiedEvent | null {
  if (parsed.channel === "state" || parsed.channel === "cmd" || parsed.channel === "ack") {
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

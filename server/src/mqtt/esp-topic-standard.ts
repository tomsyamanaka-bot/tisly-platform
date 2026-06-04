/**
 * Phase942 — ESP32 本番 MQTT トピック標準（demo 互換あり）
 *
 * 本番: tisly/{customerCode}/{siteId}/{deviceId}/{channel}
 * channel: heartbeat | event | ack | cmd
 * demo:  DEMO-ESP-* / MOCK-MQTT-001 / demo-test-site は従来どおり受理
 */

export type EspMqttChannel = "heartbeat" | "event" | "ack" | "cmd" | "state" | "recovery";

const PRODUCTION_RE =
  /^tisly\/([^/]+)\/([^/]+)\/([^/]+)\/(heartbeat|event|ack|cmd)$/;

const LEGACY_RE =
  /^tisly\/([^/]+)\/([^/]+)\/([^/]+)\/(event|state|heartbeat|recovery|cmd)$/;

export interface EspStandardTopic {
  customerCode: string;
  siteId: string;
  deviceId: string;
  channel: EspMqttChannel;
  rawTopic: string;
  format: "production" | "legacy" | "demo";
}

export function buildEspMqttTopic(
  customerCode: string,
  siteId: string,
  deviceId: string,
  channel: EspMqttChannel
): string {
  return `tisly/${customerCode}/${siteId}/${deviceId}/${channel}`;
}

/** デモ用レガシー topic（Phase901 互換） */
export function buildDemoLegacyHeartbeatTopic(tenantId: string): string {
  return `tisly/${tenantId}/demo-test-site/MOCK-MQTT-001/heartbeat`;
}

export function parseEspMqttTopic(topic: string): EspStandardTopic | null {
  const prod = topic.match(PRODUCTION_RE);
  if (prod) {
    return {
      customerCode: prod[1],
      siteId: prod[2],
      deviceId: prod[3],
      channel: prod[4] as EspMqttChannel,
      rawTopic: topic,
      format: isDemoTopicParts(prod[1], prod[2], prod[3]) ? "demo" : "production",
    };
  }
  const leg = topic.match(LEGACY_RE);
  if (leg) {
    return {
      customerCode: leg[1],
      siteId: leg[2],
      deviceId: leg[3],
      channel: leg[4] as EspMqttChannel,
      rawTopic: topic,
      format: isDemoTopicParts(leg[1], leg[2], leg[3]) ? "demo" : "legacy",
    };
  }
  return null;
}

function isDemoTopicParts(customerCode: string, siteId: string, deviceId: string): boolean {
  if (siteId === "demo-test-site") return true;
  if (deviceId === "MOCK-MQTT-001") return true;
  if (/^DEMO-ESP-/i.test(deviceId)) return true;
  return false;
}

export function mapDemoDeviceToProductionTopic(
  customerCode: string,
  siteId: string,
  legacyDeviceId: string,
  channel: EspMqttChannel = "heartbeat"
): string {
  const deviceId = legacyDeviceId.replace(/^DEMO-ESP-/i, "ESP-");
  return buildEspMqttTopic(customerCode, siteId, deviceId, channel);
}

export const DEMO_ESP_DEVICE_IDS = ["DEMO-ESP-LIVING", "DEMO-ESP-ENTRANCE", "DEMO-ESP-GARAGE"] as const;

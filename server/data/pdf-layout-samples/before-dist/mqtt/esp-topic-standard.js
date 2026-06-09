/**
 * Phase942 — ESP32 本番 MQTT トピック標準（demo 互換あり）
 *
 * 本番: tisly/{customerCode}/{siteId}/{deviceId}/{channel}
 * channel: heartbeat | event | ack | cmd
 * demo:  DEMO-ESP-* / MOCK-MQTT-001 / demo-test-site は従来どおり受理
 */
const PRODUCTION_RE = /^tisly\/([^/]+)\/([^/]+)\/([^/]+)\/(heartbeat|event|ack|cmd)$/;
const LEGACY_RE = /^tisly\/([^/]+)\/([^/]+)\/([^/]+)\/(event|state|heartbeat|recovery|cmd)$/;
export function buildEspMqttTopic(customerCode, siteId, deviceId, channel) {
    return `tisly/${customerCode}/${siteId}/${deviceId}/${channel}`;
}
/** デモ用レガシー topic（Phase901 互換） */
export function buildDemoLegacyHeartbeatTopic(tenantId) {
    return `tisly/${tenantId}/demo-test-site/MOCK-MQTT-001/heartbeat`;
}
export function parseEspMqttTopic(topic) {
    const prod = topic.match(PRODUCTION_RE);
    if (prod) {
        return {
            customerCode: prod[1],
            siteId: prod[2],
            deviceId: prod[3],
            channel: prod[4],
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
            channel: leg[4],
            rawTopic: topic,
            format: isDemoTopicParts(leg[1], leg[2], leg[3]) ? "demo" : "legacy",
        };
    }
    return null;
}
function isDemoTopicParts(customerCode, siteId, deviceId) {
    if (siteId === "demo-test-site")
        return true;
    if (deviceId === "MOCK-MQTT-001")
        return true;
    if (/^DEMO-ESP-/i.test(deviceId))
        return true;
    return false;
}
export function mapDemoDeviceToProductionTopic(customerCode, siteId, legacyDeviceId, channel = "heartbeat") {
    const deviceId = legacyDeviceId.replace(/^DEMO-ESP-/i, "ESP-");
    return buildEspMqttTopic(customerCode, siteId, deviceId, channel);
}
export const DEMO_ESP_DEVICE_IDS = ["DEMO-ESP-LIVING", "DEMO-ESP-ENTRANCE", "DEMO-ESP-GARAGE"];

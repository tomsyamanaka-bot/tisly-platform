/**
 * Phase942 — ESP32 本番 MQTT トピック標準（demo 互換あり）
 *
 * 本番: tisly/{customerCode}/{siteId}/{deviceId}/{channel}
 * channel: heartbeat | event | ack | cmd
 * demo:  DEMO-ESP-* / MOCK-MQTT-001 / demo-test-site は従来どおり受理
 */
export type EspMqttChannel = "heartbeat" | "event" | "ack" | "cmd" | "state" | "recovery";
export interface EspStandardTopic {
    customerCode: string;
    siteId: string;
    deviceId: string;
    channel: EspMqttChannel;
    rawTopic: string;
    format: "production" | "legacy" | "demo";
}
export declare function buildEspMqttTopic(customerCode: string, siteId: string, deviceId: string, channel: EspMqttChannel): string;
/** デモ用レガシー topic（Phase901 互換） */
export declare function buildDemoLegacyHeartbeatTopic(tenantId: string): string;
export declare function parseEspMqttTopic(topic: string): EspStandardTopic | null;
export declare function mapDemoDeviceToProductionTopic(customerCode: string, siteId: string, legacyDeviceId: string, channel?: EspMqttChannel): string;
export declare const DEMO_ESP_DEVICE_IDS: readonly ["DEMO-ESP-LIVING", "DEMO-ESP-ENTRANCE", "DEMO-ESP-GARAGE"];

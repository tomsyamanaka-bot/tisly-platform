import type { UnifiedEvent } from "../event/unified-event.js";
import { type EspMqttChannel } from "./esp-topic-standard.js";
export type MqttChannel = EspMqttChannel | "unknown";
export interface ParsedTopic {
    tenantId: string;
    siteId: string;
    deviceId: string;
    channel: MqttChannel;
    rawTopic: string;
    topicFormat?: "production" | "legacy" | "demo";
}
export declare function parseMqttTopic(topic: string): ParsedTopic | null;
export declare function mqttPayloadToUnified(parsed: ParsedTopic, payload: Record<string, unknown>): UnifiedEvent | null;

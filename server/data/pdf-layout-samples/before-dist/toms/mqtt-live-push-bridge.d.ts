export type MqttBridgeLogLevel = "info" | "warn" | "error";
export interface MqttBridgeLogEntry {
    at: string;
    level: MqttBridgeLogLevel;
    code: string;
    message: string;
    topic?: string;
}
export interface MqttBridgeStats {
    connected: boolean;
    brokerHost: string;
    brokerUrl: string;
    mode: "mock" | "real";
    messageCount: number;
    topicCount: number;
    lastReceivedAt: string | null;
    lastReceivedTopic: string | null;
}
export declare function recordMqttMessageReceived(topic: string): void;
export declare function getMqttBridgeStats(): MqttBridgeStats;
/** Phase 2251–2300 — MQTT_MODE を単一の真実源に */
export declare function isMqttMockMode(): boolean;
export declare function isLiveOpsMockPushEnabled(): boolean;
export declare function mqttBridgeLog(level: MqttBridgeLogLevel, code: string, message: string, topic?: string): void;
export declare function listMqttBridgeLogs(limit?: number): MqttBridgeLogEntry[];
export declare function getMqttBridgeCertStatus(): import("../mqtt/mqtt-tls.js").MqttTlsStatus;
export declare function routeMqttToLivePush(topic: string, raw: string): boolean;
export declare function onMqttBridgeConnect(url: string): void;
export declare function onMqttBridgeDisconnect(reason?: string): void;
export declare function onMqttBridgeAuthError(message: string): void;
export declare function onMqttBridgeInvalidTopic(topic: string): void;

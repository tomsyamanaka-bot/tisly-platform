export type DeviceTestKind = "heartbeat" | "event" | "relay" | "notification";
export interface DeviceTestResult {
    ok: boolean;
    kind: DeviceTestKind;
    message: string;
    at: string;
    details?: Record<string, unknown>;
}
export declare function runDeviceConnectivityTest(customerId: string, deviceId: string, kind: DeviceTestKind): DeviceTestResult;
export interface MqttRttResult {
    ok: boolean;
    roundTripMs: number | null;
    rtt_ms: number | null;
    timeout: boolean;
    message: string;
    at: string;
    tested_at: string;
    mock: boolean;
    broker_status: string;
    topic: string;
}
export declare function runMqttRttTest(customerId: string, deviceId: string): Promise<MqttRttResult>;
export declare function getMqttDiagnostic(customerId: string, deviceId: string): {
    deviceId: string;
    topic: string;
    lastHeartbeat: string | null;
    lastEvent: {} | null;
    status: string;
    latencyMs: {} | null;
    latencyPlaceholder: string | undefined;
    brokerStatus: string;
    brokerUrl: string;
};

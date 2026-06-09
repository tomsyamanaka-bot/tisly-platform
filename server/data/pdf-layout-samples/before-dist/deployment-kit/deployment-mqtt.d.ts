export type MqttDeploymentMode = "mock" | "real";
export interface MqttDeviceStatus {
    device_id: string;
    customer_code: string;
    site_id: string | null;
    last_seen: string | null;
    mqtt_topic: string;
    heartbeat_status: string | null;
}
export interface DeploymentMqttStatus {
    phase: string;
    mode: MqttDeploymentMode;
    brokerConfigured: boolean;
    brokerHost: string;
    brokerUrl: string;
    topicPrefix: string;
    subscriberEnabled: boolean;
    connected: boolean;
    messageCount: number;
    topicCount: number;
    lastReceivedAt: string | null;
    lastReceivedTopic: string | null;
    devices: MqttDeviceStatus[];
}
export declare function getMqttDeploymentMode(): MqttDeploymentMode;
export declare function getDeploymentMqttStatus(customerCode?: string): DeploymentMqttStatus;
export interface TestHeartbeatInput {
    deviceId: string;
    customerCode: string;
    siteId?: string;
}
export interface TestHeartbeatResult {
    ok: boolean;
    mode: MqttDeploymentMode;
    mock: boolean;
    device_id: string;
    customer_code: string;
    site_id: string;
    last_seen: string;
    mqtt_topic: string;
    heartbeat_status: string;
    brokerUrl: string;
}
export declare function sendTestHeartbeat(input: TestHeartbeatInput): TestHeartbeatResult;

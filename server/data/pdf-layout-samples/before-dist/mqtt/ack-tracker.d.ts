export interface MqttAckTrackResult {
    ok: boolean;
    ack_received: boolean;
    rtt_ms: number | null;
    timeout: boolean;
    topic: string;
    ack_topic: string;
    tested_at: string;
    mock: boolean;
    broker_status: string;
    message: string;
}
export declare function deviceLiveMqttTopics(siteId: string, deviceId: string): {
    topic: string;
    ackTopic: string;
};
export declare function runLiveMqttAckTest(customerId: string, deviceId: string, timeoutMs?: number): Promise<MqttAckTrackResult>;

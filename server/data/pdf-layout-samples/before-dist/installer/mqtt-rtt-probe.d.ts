export interface MqttRttProbeResult {
    ok: boolean;
    rttMs: number | null;
    timeout: boolean;
    topic: string;
    brokerStatus: "connected" | "unconfigured" | "error";
    message: string;
}
export declare function mqttBrokerConfigured(): boolean;
export declare function probeMqttRtt(topic: string, timeoutMs?: number): Promise<MqttRttProbeResult>;

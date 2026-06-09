import { getMqttTlsStatus } from "./mqtt-tls.js";
export interface MqttSubscriberConfig {
    enabled: boolean;
    url: string;
    username: string;
    password: string;
    clientId: string;
    topicPrefix: string;
    mockMode: boolean;
    tls: ReturnType<typeof getMqttTlsStatus>;
}
export declare function getMqttSubscriberConfig(): MqttSubscriberConfig;

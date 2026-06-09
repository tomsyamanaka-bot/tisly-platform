import type { IClientOptions } from "mqtt";
export interface MqttTlsStatus {
    enabled: boolean;
    configured: boolean;
    ready: boolean;
    mode: "disabled" | "mock" | "tls" | "incomplete";
    caPath?: string;
    certPath?: string;
    keyPath?: string;
    message: string;
}
export declare function isMqttTlsEnvEnabled(): boolean;
export declare function getMqttTlsStatus(mockMode: boolean): MqttTlsStatus;
export declare function shouldFallbackMqttTls(mockMode: boolean): boolean;
export declare function buildMqttConnectOptions(base: {
    clientId: string;
    username?: string;
    password?: string;
}, mockMode: boolean): IClientOptions & {
    protocol?: string;
};
export declare function mqttUrlWithTls(url: string, mockMode: boolean): string;

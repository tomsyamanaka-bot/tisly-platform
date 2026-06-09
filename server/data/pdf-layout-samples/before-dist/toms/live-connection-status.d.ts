import { getMqttBridgeCertStatus, listMqttBridgeLogs } from "./mqtt-live-push-bridge.js";
export interface LiveConnectionStatus {
    live: "live" | "offline" | "mock" | "warning";
    mqtt: {
        mode: "mock" | "real" | "disabled";
        mockPush: boolean;
        mockPushRunning: boolean;
        tls: ReturnType<typeof getMqttBridgeCertStatus>;
    };
    gmail: {
        mode: string;
        connected: boolean;
        sendMode: string;
        worker: "active";
    };
    qnap: {
        mode: "mock" | "real";
    };
    pdf: {
        mode: "html" | "puppeteer";
    };
    wsClients: number;
    bridgeLogs: ReturnType<typeof listMqttBridgeLogs>;
}
export declare function buildLiveConnectionStatus(): LiveConnectionStatus;

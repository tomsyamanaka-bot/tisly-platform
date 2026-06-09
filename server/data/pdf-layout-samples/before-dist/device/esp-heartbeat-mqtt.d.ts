export interface EspHeartbeatKpi {
    totalEsp: number;
    online: number;
    warning: number;
    offline: number;
    lastEvaluatedAt: string;
    anomalyCount: number;
    dispatchReductionEstimate: number;
}
export declare function handleEspMqttHeartbeat(deviceId: string, payload?: {
    platform?: string;
    rssi?: number;
    uptime?: number;
}): {
    status: string;
};
export declare function refreshEspHeartbeatKpi(): EspHeartbeatKpi;
export declare function getEspHeartbeatKpi(): EspHeartbeatKpi;

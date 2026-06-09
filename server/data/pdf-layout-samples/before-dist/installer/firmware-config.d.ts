export interface FirmwareConfigExport {
    device_id: string;
    mqtt_topic: string;
    cert_placeholder: string;
    ca_placeholder: string;
    endpoint: string;
    heartbeat_interval_sec: number;
    client_id: string;
    provisioning_mode: string;
}
export declare function buildFirmwareConfig(customerId: string, deviceId: string): FirmwareConfigExport;

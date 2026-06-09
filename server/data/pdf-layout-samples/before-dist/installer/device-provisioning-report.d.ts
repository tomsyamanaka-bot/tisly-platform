export interface DeviceProvisioningReportData {
    exportId: string;
    customerCode: string;
    customerName: string;
    deviceId: string;
    deviceType: string;
    serialNumber: string | null;
    mqtt: Record<string, unknown>;
    certificate: Record<string, unknown>;
    heartbeat: {
        status: string;
        lastHeartbeatAt: string | null;
        lastSeen: string | null;
        firstSeen: string | null;
    };
    map: {
        floorId: string | null;
        posX: number | null;
        posY: number | null;
    };
    qrAvailable: boolean;
    installer: string | null;
    generatedAt: string;
}
export declare function buildDeviceProvisioningReportData(customerCode: string, deviceId: string, actor?: string): DeviceProvisioningReportData;
export declare function buildDeviceProvisioningReportHtml(data: DeviceProvisioningReportData): string;
export declare function buildDeviceProvisioningReportPdf(data: DeviceProvisioningReportData): Promise<Buffer>;

export type DeploymentDeviceKind = "ESP" | "Shelly" | "Camera" | "PLC";
export interface DeploymentDeviceInput {
    customerCode: string;
    siteId: string;
    deviceId?: string;
    name: string;
    location: string;
    kind: DeploymentDeviceKind;
    zoneId?: string;
}
export declare function provisionDeploymentDevice(input: DeploymentDeviceInput): {
    id: any;
    deviceId: string;
    name: string;
    location: string;
    kind: DeploymentDeviceKind;
    siteId: string;
    customerCode: string;
    assetId: string;
    qrPayload: string;
    qrSvg: string;
    qrDataUrl: string;
    registrationUrl: null;
};
export declare function listDeploymentDevices(customerCode: string): Record<string, unknown>[];

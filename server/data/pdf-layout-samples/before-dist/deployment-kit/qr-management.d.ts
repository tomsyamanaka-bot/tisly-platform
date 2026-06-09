import type { DeploymentDeviceKind } from "./device-provision.js";
export interface DeploymentAssetInput {
    customerCode: string;
    siteId: string;
    deviceId: string;
    label: string;
    location?: string;
    kind?: DeploymentDeviceKind | string;
}
export interface DeploymentAsset {
    assetId: string;
    customerCode: string;
    siteId: string;
    deviceId: string;
    label: string;
    location: string | null;
    kind: string | null;
    scanCount: number;
    createdAt: string;
}
export declare function createDeploymentAsset(input: DeploymentAssetInput): DeploymentAsset;
export declare function getDeploymentAsset(assetId: string): DeploymentAsset | null;
export declare function recordAssetScan(assetId: string): void;
export declare function getAssetDetail(assetId: string): {
    asset: DeploymentAsset;
    customer: {
        customerCode: string;
        customerName: string;
    } | null;
    device: Record<string, unknown> | null;
    site: Record<string, unknown> | null;
    floorPlans: {
        id: unknown;
        name: unknown;
        imagePath: {} | null;
    }[];
    photos: {
        id: unknown;
        type: unknown;
        path: unknown;
        createdAt: unknown;
    }[];
    maintenanceHistory: import("../maintenance/maintenance-store.js").MaintenanceCase[];
    detailUrl: string;
} | null;
export declare function buildAssetQr(assetId: string): {
    assetId: string;
    qrPayload: string;
    qrSvg: string;
    qrDataUrl: string;
    detailUrl: string;
};
export declare function listDeploymentAssets(customerCode: string): DeploymentAsset[];

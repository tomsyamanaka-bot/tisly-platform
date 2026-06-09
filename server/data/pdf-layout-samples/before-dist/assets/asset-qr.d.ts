export declare const ASSET_DEVICE_KINDS: readonly ["ESP", "Shelly", "Camera", "Sensor", "Switch", "PLC"];
export type AssetDeviceKind = (typeof ASSET_DEVICE_KINDS)[number];
export declare function isValidAssetKind(kind: string): kind is AssetDeviceKind;
export interface AssetQrRecord {
    assetId: string;
    qrToken: string;
    deviceKind: string;
    deviceId: string;
    customerCode: string;
    label: string;
    qrUrl: string;
    svg: string;
    createdAt: string;
    reissuedAt: string | null;
}
export declare function createAssetQr(input: {
    customerCode: string;
    deviceId: string;
    deviceKind: string;
    label: string;
    siteId?: string;
    actor?: string;
    reissue?: boolean;
}): AssetQrRecord;
export declare function listAssetQrHistory(filters?: {
    assetId?: string;
    customerCode?: string;
    deviceId?: string;
    limit?: number;
}): {
    id: string;
    assetId: string;
    qrToken: string;
    action: string;
    deviceKind: string;
    deviceId: string;
    customerCode: string;
    actor: string | null;
    createdAt: string;
}[];
export declare function getAssetQrByToken(assetId: string): AssetQrRecord | null;

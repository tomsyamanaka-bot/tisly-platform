export declare const FIELD_ASSET_KINDS: readonly ["ESP", "Shelly", "Camera", "SwitchBot", "Sensor"];
export type FieldAssetKind = (typeof FIELD_ASSET_KINDS)[number];
export type FieldAssetHealth = "正常" | "注意" | "異常";
export interface FieldAssetRow {
    assetId: string;
    deviceId: string;
    deviceKind: FieldAssetKind | string;
    label: string;
    customerCode: string;
    health: FieldAssetHealth;
    healthCode: "normal" | "warning" | "abnormal";
    lastSeen: string | null;
    source: "qr" | "device";
}
export declare function listFieldAssets(filters?: {
    customerCode?: string;
    kind?: string;
    health?: string;
    limit?: number;
}): FieldAssetRow[];
export declare function summarizeFieldAssets(customerCode?: string): Record<string, number>;

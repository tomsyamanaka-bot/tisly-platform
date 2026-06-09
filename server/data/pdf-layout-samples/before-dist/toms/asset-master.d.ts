import type { TomsAssetType } from "./toms-types.js";
export interface TomsAsset {
    id: string;
    projectId: string | null;
    customerId: string | null;
    assetType: TomsAssetType | string;
    label: string;
    serialNumber: string;
    installDate: string | null;
    warrantyUntil: string | null;
    maintenanceUntil: string | null;
    qrToken: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
export declare function createAsset(input: {
    projectId?: string;
    customerId?: string;
    assetType: TomsAssetType | string;
    label: string;
    serialNumber?: string;
    installDate?: string;
    warrantyUntil?: string;
    maintenanceUntil?: string;
    metadata?: Record<string, unknown>;
}): TomsAsset;
export declare function getAsset(id: string): TomsAsset | null;
export declare function getAssetByQrToken(token: string): TomsAsset | null;
export declare function listProjectAssets(projectId: string): TomsAsset[];
export declare function listAssets(limit?: number): TomsAsset[];
export declare function getAssetQrUrl(asset: TomsAsset, baseUrl?: string): string;

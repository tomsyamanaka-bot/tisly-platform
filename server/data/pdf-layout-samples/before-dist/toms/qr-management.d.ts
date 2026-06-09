import { getAsset } from "./asset-master.js";
import { listConstructionPhotos } from "./construction-photos.js";
import { listDrawingVersions } from "./drawing-versions.js";
import { listProjectTimeline } from "./project-timeline.js";
export interface AssetQrPage {
    asset: NonNullable<ReturnType<typeof getAsset>>;
    qrUrl: string;
    history: ReturnType<typeof listProjectTimeline>;
    drawings: ReturnType<typeof listDrawingVersions>;
    photos: ReturnType<typeof listConstructionPhotos>;
}
export declare function generateAssetQrPng(assetId: string, baseUrl: string): Promise<Buffer>;
export declare function resolveAssetFromQr(token: string): AssetQrPage | null;
export declare function recordQrScan(assetId: string): void;

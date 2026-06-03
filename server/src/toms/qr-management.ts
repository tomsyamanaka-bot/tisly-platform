import QRCode from "qrcode";
import { getAsset, getAssetByQrToken, getAssetQrUrl } from "./asset-master.js";
import { listConstructionPhotos } from "./construction-photos.js";
import { listDrawingVersions } from "./drawing-versions.js";
import { getDatabase } from "../db/database.js";
import { listProjectTimeline } from "./project-timeline.js";

export interface AssetQrPage {
  asset: NonNullable<ReturnType<typeof getAsset>>;
  qrUrl: string;
  history: ReturnType<typeof listProjectTimeline>;
  drawings: ReturnType<typeof listDrawingVersions>;
  photos: ReturnType<typeof listConstructionPhotos>;
}

export async function generateAssetQrPng(assetId: string, baseUrl: string): Promise<Buffer> {
  const asset = getAsset(assetId);
  if (!asset) throw new Error("asset not found");
  const url = getAssetQrUrl(asset, baseUrl);
  return QRCode.toBuffer(url, { type: "png", margin: 1, width: 256 });
}

export function resolveAssetFromQr(token: string): AssetQrPage | null {
  const asset = getAssetByQrToken(token);
  if (!asset) return null;
  const projectId = asset.projectId;
  const history = projectId ? listProjectTimeline(projectId) : [];
  const drawings = projectId ? listDrawingVersions(projectId) : [];
  const photos = projectId ? listConstructionPhotos(projectId) : [];
  return {
    asset,
    qrUrl: getAssetQrUrl(asset),
    history,
    drawings,
    photos,
  };
}

export function recordQrScan(assetId: string): void {
  const row = getDatabase()
    .prepare(`SELECT metadata_json FROM toms_assets WHERE id = ?`)
    .get(assetId) as { metadata_json: string } | undefined;
  if (!row) return;
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(row.metadata_json || "{}") as Record<string, unknown>;
  } catch {
    meta = {};
  }
  meta.lastScanAt = new Date().toISOString();
  getDatabase()
    .prepare(`UPDATE toms_assets SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(meta), assetId);
}

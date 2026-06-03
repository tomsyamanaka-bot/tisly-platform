import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { getDatabase } from "../db/database.js";
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

function rowToAsset(r: Record<string, unknown>): TomsAsset {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(String(r.metadata_json ?? "{}")) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: String(r.id),
    projectId: r.project_id != null ? String(r.project_id) : null,
    customerId: r.customer_id != null ? String(r.customer_id) : null,
    assetType: String(r.asset_type),
    label: String(r.label),
    serialNumber: String(r.serial_number ?? ""),
    installDate: r.install_date != null ? String(r.install_date) : null,
    warrantyUntil: r.warranty_until != null ? String(r.warranty_until) : null,
    maintenanceUntil: r.maintenance_until != null ? String(r.maintenance_until) : null,
    qrToken: String(r.qr_token),
    metadata,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function newQrToken(): string {
  return crypto.randomBytes(12).toString("hex");
}

export function createAsset(input: {
  projectId?: string;
  customerId?: string;
  assetType: TomsAssetType | string;
  label: string;
  serialNumber?: string;
  installDate?: string;
  warrantyUntil?: string;
  maintenanceUntil?: string;
  metadata?: Record<string, unknown>;
}): TomsAsset {
  const id = `AST-${uuid().slice(0, 8).toUpperCase()}`;
  const qrToken = newQrToken();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO toms_assets
       (id, project_id, customer_id, asset_type, label, serial_number,
        install_date, warranty_until, maintenance_until, qr_token, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.projectId ?? null,
      input.customerId ?? null,
      input.assetType,
      input.label,
      input.serialNumber ?? "",
      input.installDate ?? null,
      input.warrantyUntil ?? null,
      input.maintenanceUntil ?? null,
      qrToken,
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );
  return getAsset(id)!;
}

export function getAsset(id: string): TomsAsset | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM toms_assets WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToAsset(row) : null;
}

export function getAssetByQrToken(token: string): TomsAsset | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM toms_assets WHERE qr_token = ?`)
    .get(token) as Record<string, unknown> | undefined;
  return row ? rowToAsset(row) : null;
}

export function listProjectAssets(projectId: string): TomsAsset[] {
  const rows = getDatabase()
    .prepare(`SELECT * FROM toms_assets WHERE project_id = ? ORDER BY created_at ASC`)
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(rowToAsset);
}

export function listAssets(limit = 200): TomsAsset[] {
  const rows = getDatabase()
    .prepare(`SELECT * FROM toms_assets ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(rowToAsset);
}

export function getAssetQrUrl(asset: TomsAsset, baseUrl = ""): string {
  const path = `/asset/${asset.id}?qr=${asset.qrToken}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

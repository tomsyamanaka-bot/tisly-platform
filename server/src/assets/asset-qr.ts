import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { buildQrSvg } from "../provisioning/device-provisioner.js";
import { config } from "../config.js";

export const ASSET_DEVICE_KINDS = [
  "ESP",
  "Shelly",
  "Camera",
  "Sensor",
  "Switch",
  "PLC",
] as const;

export type AssetDeviceKind = (typeof ASSET_DEVICE_KINDS)[number];

export function isValidAssetKind(kind: string): kind is AssetDeviceKind {
  return (ASSET_DEVICE_KINDS as readonly string[]).includes(kind);
}

function generateQrToken(): string {
  return randomBytes(12).toString("hex");
}

function recordQrHistory(input: {
  assetId: string;
  qrToken: string;
  action: "create" | "reissue";
  deviceKind: string;
  deviceId: string;
  customerCode: string;
  actor?: string;
}): void {
  const id = `QRH-${uuid().slice(0, 8).toUpperCase()}`;
  getDatabase()
    .prepare(
      `INSERT INTO asset_qr_history
       (id, asset_id, qr_token, action, device_kind, device_id, customer_code, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      id,
      input.assetId,
      input.qrToken,
      input.action,
      input.deviceKind,
      input.deviceId,
      input.customerCode.toUpperCase(),
      input.actor ?? null
    );
}

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

export function createAssetQr(input: {
  customerCode: string;
  deviceId: string;
  deviceKind: string;
  label: string;
  siteId?: string;
  actor?: string;
  reissue?: boolean;
}): AssetQrRecord {
  if (!isValidAssetKind(input.deviceKind)) {
    throw new Error(`Invalid deviceKind. Allowed: ${ASSET_DEVICE_KINDS.join(", ")}`);
  }
  const customer = getCustomerByCode(input.customerCode);
  if (!customer) throw new Error("customer not found");

  const db = getDatabase();
  const existing = db
    .prepare(`SELECT * FROM asset_qr_tokens WHERE device_id = ?`)
    .get(input.deviceId) as Record<string, unknown> | undefined;

  const qrToken = generateQrToken();
  const now = new Date().toISOString();

  if (existing && !input.reissue) {
    return formatQrRow(existing);
  }

  const assetId = existing ? String(existing.asset_id) : `AST-QR-${uuid().slice(0, 8).toUpperCase()}`;
  const action = existing ? "reissue" : "create";

  if (existing) {
    db.prepare(
      `UPDATE asset_qr_tokens SET qr_token = ?, label = ?, reissued_at = ?, updated_at = ?
       WHERE asset_id = ?`
    ).run(qrToken, input.label, now, now, assetId);
  } else {
    db.prepare(
      `INSERT INTO asset_qr_tokens
       (asset_id, customer_code, site_id, device_id, device_kind, label, qr_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId,
      input.customerCode.toUpperCase(),
      input.siteId ?? null,
      input.deviceId,
      input.deviceKind,
      input.label,
      qrToken,
      now,
      now
    );
  }

  recordQrHistory({
    assetId,
    qrToken,
    action,
    deviceKind: input.deviceKind,
    deviceId: input.deviceId,
    customerCode: input.customerCode,
    actor: input.actor,
  });

  const row = db.prepare(`SELECT * FROM asset_qr_tokens WHERE asset_id = ?`).get(assetId) as Record<
    string,
    unknown
  >;
  return formatQrRow(row);
}

function formatQrRow(row: Record<string, unknown>): AssetQrRecord {
  const qrToken = String(row.qr_token);
  const customerCode = String(row.customer_code);
  const base = config.publicUrl.replace(/\/$/, "");
  const qrUrl = `${base}/asset/${String(row.asset_id)}?token=${qrToken}`;
  return {
    assetId: String(row.asset_id),
    qrToken,
    deviceKind: String(row.device_kind),
    deviceId: String(row.device_id),
    customerCode,
    label: String(row.label),
    qrUrl,
    svg: buildQrSvg(qrUrl),
    createdAt: String(row.created_at),
    reissuedAt: row.reissued_at != null ? String(row.reissued_at) : null,
  };
}

export function listAssetQrHistory(filters?: {
  assetId?: string;
  customerCode?: string;
  deviceId?: string;
  limit?: number;
}) {
  const limit = filters?.limit ?? 100;
  let sql = `SELECT * FROM asset_qr_history WHERE 1=1`;
  const params: unknown[] = [];
  if (filters?.assetId) {
    sql += ` AND asset_id = ?`;
    params.push(filters.assetId);
  }
  if (filters?.customerCode) {
    sql += ` AND customer_code = ?`;
    params.push(filters.customerCode.toUpperCase());
  }
  if (filters?.deviceId) {
    sql += ` AND device_id = ?`;
    params.push(filters.deviceId);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = getDatabase().prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    assetId: String(r.asset_id),
    qrToken: String(r.qr_token),
    action: String(r.action),
    deviceKind: String(r.device_kind),
    deviceId: String(r.device_id),
    customerCode: String(r.customer_code),
    actor: r.actor != null ? String(r.actor) : null,
    createdAt: String(r.created_at),
  }));
}

export function getAssetQrByToken(assetId: string): AssetQrRecord | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM asset_qr_tokens WHERE asset_id = ?`)
    .get(assetId) as Record<string, unknown> | undefined;
  return row ? formatQrRow(row) : null;
}

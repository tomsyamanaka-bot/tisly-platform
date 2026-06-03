import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { hashSecret } from "./site-provisioner.js";
import { logAudit } from "./audit-log.js";

export type CommissioningStatus =
  | "draft"
  | "claimed"
  | "placed"
  | "tested"
  | "completed"
  | "failed";

export interface QrCreateInput {
  customerId: string;
  deviceId: string;
  deviceType: string;
  serialNumber: string;
  createdBy?: string;
  ttlMinutes?: number;
}

export interface QrCreateResult {
  tokenId: string;
  qrPayload: string;
  expiresAt: string;
  deviceId: string;
  deviceType: string;
  serialNumber: string;
}

export interface QrClaimInput {
  customerId: string;
  deviceId: string;
  deviceType: string;
  serialNumber: string;
  provisioningToken: string;
  siteId?: string;
  floorId?: string;
  zoneId?: string;
  claimedBy?: string;
}

function generateProvisioningToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createQrProvisioning(input: QrCreateInput): QrCreateResult {
  const db = getDatabase();
  const token = generateProvisioningToken();
  const tokenHash = hashSecret(token);
  const ttl = input.ttlMinutes ?? 60 * 24;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  const id = uuid();

  db.prepare(
    `INSERT INTO qr_provisioning_tokens (id, customer_id, device_id, device_type, serial_number, token_hash, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.customerId,
    input.deviceId,
    input.deviceType,
    input.serialNumber,
    tokenHash,
    expiresAt,
    input.createdBy ?? null
  );

  const qrPayload = JSON.stringify({
    v: 2,
    device_id: input.deviceId,
    device_type: input.deviceType,
    serial_number: input.serialNumber,
    provisioning_token: token,
    expires_at: expiresAt,
    customer_id: input.customerId,
  });

  logAudit({
    tenantId: input.customerId,
    actorId: input.createdBy,
    action: "qr.create",
    entityType: "device",
    entityId: input.deviceId,
    details: { serialNumber: input.serialNumber, expiresAt },
  });

  return {
    tokenId: id,
    qrPayload,
    expiresAt,
    deviceId: input.deviceId,
    deviceType: input.deviceType,
    serialNumber: input.serialNumber,
  };
}

export function claimQrProvisioning(input: QrClaimInput): { deviceRowId: string; deviceId: string } {
  const db = getDatabase();
  const tokenHash = hashSecret(input.provisioningToken);
  const row = db
    .prepare(
      `SELECT id, customer_id, device_id, device_type, serial_number, expires_at, used_at
       FROM qr_provisioning_tokens WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        customer_id: string;
        device_id: string;
        device_type: string;
        serial_number: string;
        expires_at: string;
        used_at: string | null;
      }
    | undefined;

  if (!row) {
    throw new Error("Invalid or unknown provisioning token");
  }
  if (row.customer_id !== input.customerId) {
    throw new Error("QR token not valid for this customer");
  }
  if (row.used_at) {
    throw new Error("QR token already used");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("QR token expired");
  }
  if (
    row.device_id !== input.deviceId ||
    row.device_type !== input.deviceType ||
    row.serial_number !== input.serialNumber
  ) {
    throw new Error("QR payload mismatch");
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE qr_provisioning_tokens SET used_at = ? WHERE id = ?`).run(now, row.id);

  const existing = db
    .prepare(`SELECT id FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(input.deviceId, input.customerId) as { id: string } | undefined;

  let deviceRowId: string;
  if (existing) {
    deviceRowId = existing.id;
    db.prepare(
      `UPDATE devices SET
         commissioning_status = 'claimed',
         commissioned_at = ?,
         commissioned_by = ?,
         provisioning_token_hash = ?,
         serial_number = ?,
         device_type = ?,
         site_id = COALESCE(?, site_id),
         floor_id = COALESCE(?, floor_id),
         zone_id = COALESCE(?, zone_id),
         updated_at = ?
       WHERE id = ?`
    ).run(
      now,
      input.claimedBy ?? null,
      tokenHash,
      input.serialNumber,
      input.deviceType,
      input.siteId ?? null,
      input.floorId ?? null,
      input.zoneId ?? null,
      now,
      deviceRowId
    );
  } else {
    deviceRowId = uuid();
    db.prepare(
      `INSERT INTO devices (id, customer_id, site_id, floor_id, zone_id, device_type, device_id, label, serial_number,
         commissioning_status, commissioned_at, commissioned_by, provisioning_token_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?, ?)`
    ).run(
      deviceRowId,
      input.customerId,
      input.siteId ?? null,
      input.floorId ?? null,
      input.zoneId ?? null,
      input.deviceType,
      input.deviceId,
      input.deviceId,
      input.serialNumber,
      now,
      input.claimedBy ?? null,
      tokenHash,
      now,
      now
    );
  }

  logAudit({
    tenantId: input.customerId,
    actorId: input.claimedBy,
    action: "qr.claim",
    entityType: "device",
    entityId: input.deviceId,
    details: { serialNumber: input.serialNumber },
  });

  return { deviceRowId, deviceId: input.deviceId };
}

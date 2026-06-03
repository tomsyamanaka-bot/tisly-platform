/**
 * Device CSR registration and certificate issue/revoke (self-signed placeholder — Phase 381–400).
 */

import { getDatabase } from "../db/database.js";
import {
  issueDeviceCertificatePlaceholder,
  revokeCertificatePlaceholder,
  applyTrustToDeviceRow,
  type DeviceCertificatePlaceholder,
  type DeviceCertStatus,
} from "./device-certificates.js";

export interface DeviceCsrRecord {
  deviceId: string;
  csrPem: string;
  subject: string;
  registeredAt: string;
  registeredBy: string | null;
}

export interface DeviceCertStatusResponse {
  deviceId: string;
  certStatus: DeviceCertStatus;
  trustLevel: string | null;
  fingerprint: string | null;
  csrRegistered: boolean;
  certIssued: boolean;
  revoked: boolean;
  issuedAt: string | null;
  rotationDueAt: string | null;
}

function loadCertMeta(deviceId: string, customerId: string): Record<string, unknown> {
  const row = getDatabase()
    .prepare(`SELECT metadata_json FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { metadata_json: string | null } | undefined;
  if (!row?.metadata_json) return {};
  try {
    return JSON.parse(row.metadata_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveCertMeta(deviceId: string, customerId: string, patch: Record<string, unknown>): void {
  const merged = { ...loadCertMeta(deviceId, customerId), ...patch };
  getDatabase()
    .prepare(
      `UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ? AND customer_id = ?`
    )
    .run(JSON.stringify(merged), deviceId, customerId);
}

function assertDevice(deviceId: string, customerId: string): void {
  const row = getDatabase()
    .prepare(`SELECT device_id FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId);
  if (!row) throw new Error("Device not found");
}

export function registerDeviceCsr(
  customerId: string,
  deviceId: string,
  csrPem: string,
  actor?: string
): DeviceCsrRecord {
  assertDevice(deviceId, customerId);
  const subject = `CN=${deviceId},O=TiSLY,C=JP`;
  const record: DeviceCsrRecord = {
    deviceId,
    csrPem: csrPem.trim() || `-----BEGIN CERTIFICATE REQUEST-----\nPLACEHOLDER-CSR-${deviceId}\n-----END CERTIFICATE REQUEST-----`,
    subject,
    registeredAt: new Date().toISOString(),
    registeredBy: actor ?? null,
  };
  saveCertMeta(deviceId, customerId, { csr: record });
  getDatabase()
    .prepare(`UPDATE devices SET cert_status = 'none', updated_at = datetime('now') WHERE device_id = ? AND customer_id = ?`)
    .run(deviceId, customerId);
  return record;
}

export function issueDeviceCertFromCsr(
  customerId: string,
  deviceId: string
): DeviceCertificatePlaceholder {
  assertDevice(deviceId, customerId);
  const meta = loadCertMeta(deviceId, customerId);
  if (!meta.csr) throw new Error("CSR not registered — POST csr first");
  const cert = issueDeviceCertificatePlaceholder(deviceId);
  cert.certStatus = "trusted";
  cert.trustLevel = "trusted";
  applyTrustToDeviceRow(deviceId, customerId, cert);
  saveCertMeta(deviceId, customerId, {
    certIssuedAt: new Date().toISOString(),
    certPlaceholder: true,
  });
  return cert;
}

export function revokeDeviceCert(customerId: string, deviceId: string): { deviceId: string; certStatus: DeviceCertStatus } {
  assertDevice(deviceId, customerId);
  const revoked = revokeCertificatePlaceholder(deviceId);
  getDatabase()
    .prepare(
      `UPDATE devices SET cert_status = ?, trust_level = 'none', updated_at = datetime('now')
       WHERE device_id = ? AND customer_id = ?`
    )
    .run(revoked.certStatus, deviceId, customerId);
  saveCertMeta(deviceId, customerId, { revokedAt: new Date().toISOString() });
  return revoked;
}

export function getDeviceCertStatus(customerId: string, deviceId: string): DeviceCertStatusResponse {
  assertDevice(deviceId, customerId);
  const row = getDatabase()
    .prepare(
      `SELECT cert_status, trust_level, cert_fingerprint, last_cert_rotated_at FROM devices
       WHERE device_id = ? AND customer_id = ?`
    )
    .get(deviceId, customerId) as {
    cert_status: string | null;
    trust_level: string | null;
    cert_fingerprint: string | null;
    last_cert_rotated_at: string | null;
  };
  const meta = loadCertMeta(deviceId, customerId);
  const csr = meta.csr as DeviceCsrRecord | undefined;
  const status = (row.cert_status ?? "none") as DeviceCertStatus;
  return {
    deviceId,
    certStatus: status,
    trustLevel: row.trust_level,
    fingerprint: row.cert_fingerprint,
    csrRegistered: !!csr,
    certIssued: status === "provisioned" || status === "trusted",
    revoked: status === "revoked",
    issuedAt: (meta.certIssuedAt as string) ?? row.last_cert_rotated_at,
    rotationDueAt: null,
  };
}

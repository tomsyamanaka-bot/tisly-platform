/**
 * Device mTLS certificate provisioning (placeholder — Phase 361–380 design).
 * See docs/device_mtls_provisioning.md
 */

import { getDatabase } from "../db/database.js";

export type DeviceCertStatus = "none" | "provisioned" | "trusted" | "expired" | "revoked";
export type DeviceTrustLevel = "none" | "bootstrap" | "provisioned" | "trusted";

export interface DeviceCertificatePlaceholder {
  deviceId: string;
  csrPem: string | null;
  certPem: string | null;
  caChain: string[];
  certStatus: DeviceCertStatus;
  trustLevel: DeviceTrustLevel;
  fingerprint: string | null;
  mqttTlsPort: number;
  rotationDueAt: string | null;
}

export function generateCsrPlaceholder(deviceId: string): { csrPem: string; subject: string } {
  return {
    csrPem: `-----BEGIN CERTIFICATE REQUEST-----\nPLACEHOLDER-CSR-${deviceId}\n-----END CERTIFICATE REQUEST-----`,
    subject: `CN=${deviceId},O=TiSLY,C=JP`,
  };
}

export function issueDeviceCertificatePlaceholder(deviceId: string): DeviceCertificatePlaceholder {
  const fingerprint = `sha256:placeholder-${deviceId.slice(0, 12)}`;
  return {
    deviceId,
    csrPem: generateCsrPlaceholder(deviceId).csrPem,
    certPem: `-----BEGIN CERTIFICATE-----\nPLACEHOLDER-CERT-${deviceId}\n-----END CERTIFICATE-----`,
    caChain: ["-----BEGIN CERTIFICATE-----\nPLACEHOLDER-CA\n-----END CERTIFICATE-----"],
    certStatus: "provisioned",
    trustLevel: "provisioned",
    fingerprint,
    mqttTlsPort: 8883,
    rotationDueAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function rotateCertificatePlaceholder(deviceId: string): DeviceCertificatePlaceholder {
  const cert = issueDeviceCertificatePlaceholder(deviceId);
  cert.certStatus = "trusted";
  cert.trustLevel = "trusted";
  return cert;
}

export function revokeCertificatePlaceholder(deviceId: string): { deviceId: string; certStatus: DeviceCertStatus } {
  return { deviceId, certStatus: "revoked" };
}

export function applyTrustToDeviceRow(
  deviceId: string,
  customerId: string,
  cert: DeviceCertificatePlaceholder
): void {
  getDatabase()
    .prepare(
      `UPDATE devices SET cert_status = ?, cert_fingerprint = ?, trust_level = ?,
       last_cert_rotated_at = datetime('now'), updated_at = datetime('now')
       WHERE device_id = ? AND customer_id = ?`
    )
    .run(cert.certStatus, cert.fingerprint, cert.trustLevel, deviceId, customerId);
}

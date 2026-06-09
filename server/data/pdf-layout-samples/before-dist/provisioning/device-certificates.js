/**
 * Device mTLS certificate provisioning (placeholder — Phase 361–380 design).
 * See docs/device_mtls_provisioning.md
 */
import { getDatabase } from "../db/database.js";
export function generateCsrPlaceholder(deviceId) {
    return {
        csrPem: `-----BEGIN CERTIFICATE REQUEST-----\nPLACEHOLDER-CSR-${deviceId}\n-----END CERTIFICATE REQUEST-----`,
        subject: `CN=${deviceId},O=TiSLY,C=JP`,
    };
}
export function issueDeviceCertificatePlaceholder(deviceId) {
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
export function rotateCertificatePlaceholder(deviceId) {
    const cert = issueDeviceCertificatePlaceholder(deviceId);
    cert.certStatus = "trusted";
    cert.trustLevel = "trusted";
    return cert;
}
export function revokeCertificatePlaceholder(deviceId) {
    return { deviceId, certStatus: "revoked" };
}
export function applyTrustToDeviceRow(deviceId, customerId, cert) {
    getDatabase()
        .prepare(`UPDATE devices SET cert_status = ?, cert_fingerprint = ?, trust_level = ?,
       last_cert_rotated_at = datetime('now'), updated_at = datetime('now')
       WHERE device_id = ? AND customer_id = ?`)
        .run(cert.certStatus, cert.fingerprint, cert.trustLevel, deviceId, customerId);
}

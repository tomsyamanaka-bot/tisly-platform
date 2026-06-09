/**
 * Device CSR registration and certificate issue/revoke (self-signed placeholder — Phase 381–400).
 */
import { getDatabase } from "../db/database.js";
import { issueDeviceCertificatePlaceholder, revokeCertificatePlaceholder, applyTrustToDeviceRow, } from "./device-certificates.js";
function loadCertMeta(deviceId, customerId) {
    const row = getDatabase()
        .prepare(`SELECT metadata_json FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    if (!row?.metadata_json)
        return {};
    try {
        return JSON.parse(row.metadata_json);
    }
    catch {
        return {};
    }
}
function saveCertMeta(deviceId, customerId, patch) {
    const merged = { ...loadCertMeta(deviceId, customerId), ...patch };
    getDatabase()
        .prepare(`UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ? AND customer_id = ?`)
        .run(JSON.stringify(merged), deviceId, customerId);
}
function assertDevice(deviceId, customerId) {
    const row = getDatabase()
        .prepare(`SELECT device_id FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    if (!row)
        throw new Error("Device not found");
}
export function registerDeviceCsr(customerId, deviceId, csrPem, actor) {
    assertDevice(deviceId, customerId);
    const subject = `CN=${deviceId},O=TiSLY,C=JP`;
    const record = {
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
export function issueDeviceCertFromCsr(customerId, deviceId) {
    assertDevice(deviceId, customerId);
    const meta = loadCertMeta(deviceId, customerId);
    if (!meta.csr)
        throw new Error("CSR not registered — POST csr first");
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
export function revokeDeviceCert(customerId, deviceId) {
    assertDevice(deviceId, customerId);
    const revoked = revokeCertificatePlaceholder(deviceId);
    getDatabase()
        .prepare(`UPDATE devices SET cert_status = ?, trust_level = 'none', updated_at = datetime('now')
       WHERE device_id = ? AND customer_id = ?`)
        .run(revoked.certStatus, deviceId, customerId);
    saveCertMeta(deviceId, customerId, { revokedAt: new Date().toISOString() });
    return revoked;
}
export function getDeviceCertStatus(customerId, deviceId) {
    assertDevice(deviceId, customerId);
    const row = getDatabase()
        .prepare(`SELECT cert_status, trust_level, cert_fingerprint, last_cert_rotated_at FROM devices
       WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    const meta = loadCertMeta(deviceId, customerId);
    const csr = meta.csr;
    const status = (row.cert_status ?? "none");
    return {
        deviceId,
        certStatus: status,
        trustLevel: row.trust_level,
        fingerprint: row.cert_fingerprint,
        csrRegistered: !!csr,
        certIssued: status === "provisioned" || status === "trusted",
        revoked: status === "revoked",
        issuedAt: meta.certIssuedAt ?? row.last_cert_rotated_at,
        rotationDueAt: null,
    };
}

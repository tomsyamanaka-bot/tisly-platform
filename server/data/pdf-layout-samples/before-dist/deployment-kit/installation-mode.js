/**
 * Phase 1001–1040 — Installation Mode enhancements for installer PWA
 */
import { v4 as uuid } from "uuid";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getDatabase } from "../db/database.js";
import { logAudit } from "../provisioning/audit-log.js";
export function recordInstallStep(input) {
    const customer = getCustomerByCode(input.customerCode);
    if (!customer)
        throw new Error("customer not found");
    const id = uuid();
    const db = getDatabase();
    db.prepare(`INSERT INTO deployment_install_records
       (id, customer_id, customer_code, site_id, device_id, step, photo_path, signature_data,
        gps_lat, gps_lng, notes, installer_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, customer.customer_id, customer.customer_code, input.siteId ?? null, input.deviceId ?? null, input.step, input.photoPath ?? null, input.signatureData ?? null, input.gpsLat ?? null, input.gpsLng ?? null, input.notes ?? null, input.installerUserId ?? null);
    if (input.step === "placement" && input.deviceId) {
        db.prepare(`UPDATE devices SET commissioning_status = 'placed', commissioned_at = datetime('now') WHERE device_id = ?`).run(input.deviceId);
    }
    if (input.step === "test" && input.deviceId) {
        db.prepare(`UPDATE devices SET commissioning_status = 'tested', last_test_result = ? WHERE device_id = ?`).run(input.notes ?? "ok", input.deviceId);
    }
    if (input.step === "sign" && input.deviceId) {
        db.prepare(`UPDATE devices SET commissioning_status = 'completed', commissioned_at = datetime('now') WHERE device_id = ?`).run(input.deviceId);
    }
    logAudit({
        tenantId: customer.tenant_id ?? customer.customer_id,
        siteId: input.siteId,
        action: `deployment.install.${input.step}`,
        entityType: "device",
        entityId: input.deviceId ?? id,
        details: { step: input.step, gps: input.gpsLat != null ? [input.gpsLat, input.gpsLng] : null },
    });
    return { id, step: input.step, recordedAt: new Date().toISOString() };
}
export function getInstallRecords(customerCode, deviceId) {
    const sql = deviceId
        ? `SELECT * FROM deployment_install_records WHERE customer_code = ? AND device_id = ? ORDER BY created_at DESC`
        : `SELECT * FROM deployment_install_records WHERE customer_code = ? ORDER BY created_at DESC`;
    const args = deviceId ? [customerCode.toUpperCase(), deviceId] : [customerCode.toUpperCase()];
    return getDatabase().prepare(sql).all(...args);
}
export function getInstallationDashboard(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return null;
    const db = getDatabase();
    const devices = db
        .prepare(`SELECT device_id, label, commissioning_status, site_id FROM devices WHERE customer_id = ?`)
        .all(customer.customer_id);
    const records = getInstallRecords(customerCode);
    const stepsByDevice = new Map();
    for (const r of records) {
        if (!r.device_id)
            continue;
        if (!stepsByDevice.has(r.device_id))
            stepsByDevice.set(r.device_id, new Set());
        stepsByDevice.get(r.device_id).add(r.step);
    }
    return {
        customerCode,
        devices: devices.map((d) => ({
            deviceId: d.device_id,
            label: d.label,
            siteId: d.site_id,
            status: d.commissioning_status,
            steps: [...(stepsByDevice.get(d.device_id) ?? [])],
            complete: d.commissioning_status === "completed",
        })),
        installUrl: `/customer/${customerCode}/install/home`,
    };
}

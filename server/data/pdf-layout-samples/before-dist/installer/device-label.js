import { getDatabase } from "../db/database.js";
import { createQrProvisioning } from "../provisioning/qr-provisioning.js";
export function getDeviceLabelData(customerId, deviceId) {
    const db = getDatabase();
    const row = db
        .prepare(`SELECT d.device_id, d.serial_number, d.label, d.site_id, d.zone_id, d.device_type,
              s.name as site_name, z.name as zone_name
       FROM devices d
       LEFT JOIN sites s ON s.id = d.site_id
       LEFT JOIN zones z ON z.id = d.zone_id
       WHERE d.device_id = ? AND d.customer_id = ?`)
        .get(deviceId, customerId);
    if (!row)
        throw new Error("Device not found");
    const qr = createQrProvisioning({
        customerId,
        deviceId: row.device_id,
        deviceType: row.device_type ?? "ESP32",
        serialNumber: row.serial_number ?? row.device_id,
    });
    const labelText = [
        row.device_id,
        row.serial_number ? `S/N ${row.serial_number}` : null,
        row.site_name ? `Site: ${row.site_name}` : null,
        row.zone_name ? `Zone: ${row.zone_name}` : null,
    ]
        .filter(Boolean)
        .join(" · ");
    return {
        deviceId: row.device_id,
        serial: row.serial_number ?? row.device_id,
        site: row.site_name ?? row.site_id,
        zone: row.zone_name ?? row.zone_id,
        qrPayload: qr.qrPayload,
        labelText,
        expiresAt: qr.expiresAt,
    };
}

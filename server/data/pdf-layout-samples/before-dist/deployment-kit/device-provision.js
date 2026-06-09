/**
 * Phase 1001–1040 — Device Provisioning for first customer deployment
 */
import { v4 as uuid } from "uuid";
import { getCustomerByCode } from "../customer/customer-store.js";
import { getDatabase } from "../db/database.js";
import { buildQrSvg } from "../provisioning/device-provisioner.js";
import { createDeploymentAsset } from "./qr-management.js";
import { logAudit } from "../provisioning/audit-log.js";
const KIND_MAP = {
    ESP: { deviceType: "esp32", platform: "esp-idf" },
    Shelly: { deviceType: "shelly", platform: "shelly-gen2" },
    Camera: { deviceType: "camera", platform: "onvif" },
    PLC: { deviceType: "plc", platform: "mitsubishi-fx" },
};
export function provisionDeploymentDevice(input) {
    const customer = getCustomerByCode(input.customerCode);
    if (!customer)
        throw new Error("customer not found");
    const db = getDatabase();
    const site = db
        .prepare(`SELECT id, tenant_id FROM sites WHERE id = ? AND (customer_id = ? OR tenant_id = ?)`)
        .get(input.siteId, customer.customer_id, customer.tenant_id ?? customer.customer_id);
    if (!site)
        throw new Error("site not found for customer");
    const mapped = KIND_MAP[input.kind];
    const deviceId = input.deviceId ??
        `${customer.customer_code}-${input.kind.toUpperCase()}-${uuid().slice(0, 6).toUpperCase()}`;
    const existing = db.prepare(`SELECT id FROM devices WHERE device_id = ?`).get(deviceId);
    if (existing)
        throw new Error(`deviceId ${deviceId} already exists`);
    const id = uuid();
    const meta = {
        tenant_id: customer.tenant_id ?? customer.customer_id,
        site_id: input.siteId,
        customer_code: customer.customer_code,
        location: input.location,
        deployment_kit: true,
        integration_phase: "1001-1040",
    };
    db.prepare(`INSERT INTO devices (id, device_type, platform, device_id, label, customer_id, site_id,
      metadata_json, heartbeat_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown')`).run(id, mapped.deviceType, mapped.platform, deviceId, input.name, customer.customer_id, input.siteId, JSON.stringify(meta));
    const asset = createDeploymentAsset({
        customerCode: customer.customer_code,
        siteId: input.siteId,
        deviceId,
        label: input.name,
        location: input.location,
        kind: input.kind,
    });
    const qrPayload = JSON.stringify({
        v: 3,
        assetId: asset.assetId,
        customerCode: customer.customer_code,
        siteId: input.siteId,
        deviceId,
        location: input.location,
        kind: input.kind,
    });
    const qrSvg = buildQrSvg(qrPayload);
    logAudit({
        tenantId: customer.tenant_id ?? customer.customer_id,
        siteId: input.siteId,
        action: "deployment.device.provision",
        entityType: "device",
        entityId: deviceId,
        details: { kind: input.kind, location: input.location, assetId: asset.assetId },
    });
    return {
        id,
        deviceId,
        name: input.name,
        location: input.location,
        kind: input.kind,
        siteId: input.siteId,
        customerCode: customer.customer_code,
        assetId: asset.assetId,
        qrPayload,
        qrSvg,
        qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`,
        registrationUrl: null,
    };
}
export function listDeploymentDevices(customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer)
        return [];
    return getDatabase()
        .prepare(`SELECT d.id, d.device_id, d.device_type, d.label, d.site_id, d.heartbeat_status,
              d.commissioning_status, d.metadata_json, a.asset_id
       FROM devices d
       LEFT JOIN deployment_assets a ON a.device_id = d.device_id
       WHERE d.customer_id = ?
       ORDER BY d.label`)
        .all(customer.customer_id);
}

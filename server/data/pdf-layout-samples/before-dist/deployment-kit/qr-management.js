/**
 * Phase 1001–1040 — QR Management for deployed assets
 */
import { randomBytes } from "crypto";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { listMaintenanceCases } from "../maintenance/maintenance-store.js";
import { buildQrSvg } from "../provisioning/device-provisioner.js";
import { config } from "../config.js";
function generateAssetId() {
    return `AST-${randomBytes(4).toString("hex").toUpperCase()}`;
}
export function createDeploymentAsset(input) {
    const db = getDatabase();
    const existing = db
        .prepare(`SELECT asset_id FROM deployment_assets WHERE device_id = ?`)
        .get(input.deviceId);
    if (existing) {
        return getDeploymentAsset(existing.asset_id);
    }
    const assetId = generateAssetId();
    db.prepare(`INSERT INTO deployment_assets
       (asset_id, customer_code, site_id, device_id, label, location, kind, scan_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`).run(assetId, input.customerCode.toUpperCase(), input.siteId, input.deviceId, input.label, input.location ?? null, input.kind ?? null);
    return getDeploymentAsset(assetId);
}
export function getDeploymentAsset(assetId) {
    const row = getDatabase()
        .prepare(`SELECT * FROM deployment_assets WHERE asset_id = ?`)
        .get(assetId);
    if (!row)
        return null;
    return {
        assetId: String(row.asset_id),
        customerCode: String(row.customer_code),
        siteId: String(row.site_id),
        deviceId: String(row.device_id),
        label: String(row.label),
        location: row.location != null ? String(row.location) : null,
        kind: row.kind != null ? String(row.kind) : null,
        scanCount: Number(row.scan_count ?? 0),
        createdAt: String(row.created_at),
    };
}
export function recordAssetScan(assetId) {
    getDatabase()
        .prepare(`UPDATE deployment_assets SET scan_count = scan_count + 1, last_scan_at = datetime('now') WHERE asset_id = ?`)
        .run(assetId);
}
export function getAssetDetail(assetId) {
    const asset = getDeploymentAsset(assetId);
    if (!asset)
        return null;
    recordAssetScan(assetId);
    const db = getDatabase();
    const device = db
        .prepare(`SELECT id, device_id, device_type, label, site_id, heartbeat_status, commissioning_status,
              last_seen, metadata_json, install_note
       FROM devices WHERE device_id = ?`)
        .get(asset.deviceId);
    const site = db
        .prepare(`SELECT id, name, address, site_type FROM sites WHERE id = ?`)
        .get(asset.siteId);
    let floors = [];
    try {
        floors = db
            .prepare(`SELECT f.id, f.name, f.floor_plan_path, fm.image_path
         FROM floors f
         LEFT JOIN floor_maps fm ON fm.floor_id = f.id
         WHERE f.site_id = ?
         ORDER BY f.order_no`)
            .all(asset.siteId);
    }
    catch {
        floors = [];
    }
    let photos = [];
    try {
        photos = db
            .prepare(`SELECT id, photo_type, photo_path, uploaded_at
         FROM install_photos
         WHERE customer_id = (SELECT customer_id FROM customers WHERE customer_code = ? COLLATE NOCASE)
           AND (device_id = ? OR site_id = ?)
         ORDER BY uploaded_at DESC LIMIT 20`)
            .all(asset.customerCode, asset.deviceId, asset.siteId);
    }
    catch {
        photos = [];
    }
    const maintenanceHistory = listMaintenanceCases(asset.customerCode).filter((c) => c.deviceIds.includes(asset.deviceId) || c.siteId === asset.siteId);
    const customer = getCustomerByCode(asset.customerCode);
    return {
        asset,
        customer: customer
            ? { customerCode: customer.customer_code, customerName: customer.customer_name }
            : null,
        device: device ?? null,
        site: site ?? null,
        floorPlans: floors.map((f) => ({
            id: f.id,
            name: f.name,
            imagePath: f.floor_plan_path ?? f.image_path ?? null,
        })),
        photos: photos.map((p) => ({
            id: p.id,
            type: p.photo_type,
            path: p.photo_path,
            createdAt: p.uploaded_at,
        })),
        maintenanceHistory,
        detailUrl: `${config.publicUrl}/asset/${assetId}`,
    };
}
export function buildAssetQr(assetId) {
    const asset = getDeploymentAsset(assetId);
    if (!asset)
        throw new Error("asset not found");
    const qrPayload = JSON.stringify({
        v: 3,
        assetId: asset.assetId,
        customerCode: asset.customerCode,
        siteId: asset.siteId,
        deviceId: asset.deviceId,
        url: `${config.publicUrl}/asset/${assetId}`,
    });
    const qrSvg = buildQrSvg(qrPayload);
    return {
        assetId,
        qrPayload,
        qrSvg,
        qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`,
        detailUrl: `${config.publicUrl}/asset/${assetId}`,
    };
}
export function listDeploymentAssets(customerCode) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM deployment_assets WHERE customer_code = ? ORDER BY created_at DESC`)
        .all(customerCode.toUpperCase());
    return rows.map((row) => ({
        assetId: String(row.asset_id),
        customerCode: String(row.customer_code),
        siteId: String(row.site_id),
        deviceId: String(row.device_id),
        label: String(row.label),
        location: row.location != null ? String(row.location) : null,
        kind: row.kind != null ? String(row.kind) : null,
        scanCount: Number(row.scan_count ?? 0),
        createdAt: String(row.created_at),
    }));
}

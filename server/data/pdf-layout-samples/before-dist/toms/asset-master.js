import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { getDatabase } from "../db/database.js";
function rowToAsset(r) {
    let metadata = {};
    try {
        metadata = JSON.parse(String(r.metadata_json ?? "{}"));
    }
    catch {
        metadata = {};
    }
    return {
        id: String(r.id),
        projectId: r.project_id != null ? String(r.project_id) : null,
        customerId: r.customer_id != null ? String(r.customer_id) : null,
        assetType: String(r.asset_type),
        label: String(r.label),
        serialNumber: String(r.serial_number ?? ""),
        installDate: r.install_date != null ? String(r.install_date) : null,
        warrantyUntil: r.warranty_until != null ? String(r.warranty_until) : null,
        maintenanceUntil: r.maintenance_until != null ? String(r.maintenance_until) : null,
        qrToken: String(r.qr_token),
        metadata,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
    };
}
function newQrToken() {
    return crypto.randomBytes(12).toString("hex");
}
export function createAsset(input) {
    const id = `AST-${uuid().slice(0, 8).toUpperCase()}`;
    const qrToken = newQrToken();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO toms_assets
       (id, project_id, customer_id, asset_type, label, serial_number,
        install_date, warranty_until, maintenance_until, qr_token, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.projectId ?? null, input.customerId ?? null, input.assetType, input.label, input.serialNumber ?? "", input.installDate ?? null, input.warrantyUntil ?? null, input.maintenanceUntil ?? null, qrToken, JSON.stringify(input.metadata ?? {}), now, now);
    return getAsset(id);
}
export function getAsset(id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM toms_assets WHERE id = ?`)
        .get(id);
    return row ? rowToAsset(row) : null;
}
export function getAssetByQrToken(token) {
    const row = getDatabase()
        .prepare(`SELECT * FROM toms_assets WHERE qr_token = ?`)
        .get(token);
    return row ? rowToAsset(row) : null;
}
export function listProjectAssets(projectId) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM toms_assets WHERE project_id = ? ORDER BY created_at ASC`)
        .all(projectId);
    return rows.map(rowToAsset);
}
export function listAssets(limit = 200) {
    const rows = getDatabase()
        .prepare(`SELECT * FROM toms_assets ORDER BY updated_at DESC LIMIT ?`)
        .all(limit);
    return rows.map(rowToAsset);
}
export function getAssetQrUrl(asset, baseUrl = "") {
    const path = `/asset/${asset.id}?qr=${asset.qrToken}`;
    return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { claimQrProvisioning } from "../provisioning/qr-provisioning.js";
import { claimNfcProvisioning } from "../provisioning/nfc-provisioning.js";
import { completeChecklistItem } from "./install-checklist.js";
import { updateFieldChecklistItem, } from "./installer-field-checklist.js";
import { runDeviceConnectivityTest } from "./device-connectivity-test.js";
import { saveInstallPhoto, isValidInstallPhotoType } from "./install-photos.js";
function deviceUpdatedAt(deviceId, customerId) {
    const row = getDatabase()
        .prepare(`SELECT updated_at FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    return row?.updated_at ?? null;
}
function isAlreadyClaimed(deviceId, customerId) {
    const row = getDatabase()
        .prepare(`SELECT commissioning_status FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    return row?.commissioning_status === "claimed" || row?.commissioning_status === "completed";
}
function photoExists(customerId, fileName) {
    const row = getDatabase()
        .prepare(`SELECT id FROM install_photos WHERE customer_id = ? AND photo_path LIKE ? LIMIT 1`)
        .get(customerId, `%${fileName}`);
    return !!row;
}
export function processOfflineSync(customerId, entries, actor) {
    const results = [];
    let applied = 0;
    let skipped = 0;
    let rejected = 0;
    let warnings = 0;
    for (const entry of entries) {
        const id = entry.id ?? uuid();
        const body = entry.body ?? {};
        try {
            switch (entry.action) {
                case "qr_claim": {
                    const deviceId = String(body.device_id ?? "");
                    if (isAlreadyClaimed(deviceId, customerId)) {
                        results.push({
                            id,
                            action: entry.action,
                            status: "rejected",
                            message: "Device already claimed",
                        });
                        rejected++;
                        break;
                    }
                    const serverAt = deviceUpdatedAt(deviceId, customerId);
                    if (serverAt && entry.clientAt && serverAt > entry.clientAt) {
                        results.push({
                            id,
                            action: entry.action,
                            status: "conflict",
                            message: "Server record newer than client — manual merge required",
                        });
                        warnings++;
                        rejected++;
                        break;
                    }
                    claimQrProvisioning({
                        customerId,
                        deviceId,
                        deviceType: String(body.device_type ?? "ESP32"),
                        serialNumber: String(body.serial_number ?? deviceId),
                        provisioningToken: String(body.provisioning_token ?? ""),
                        siteId: body.siteId,
                        floorId: body.floorId,
                        zoneId: body.zoneId,
                        claimedBy: actor,
                    });
                    results.push({ id, action: entry.action, status: "applied", message: "QR claim applied" });
                    applied++;
                    break;
                }
                case "nfc_claim": {
                    const nfcUid = String(body.nfcUid ?? "");
                    const explicitId = body.deviceId ? String(body.deviceId) : null;
                    if (explicitId && isAlreadyClaimed(explicitId, customerId)) {
                        results.push({
                            id,
                            action: entry.action,
                            status: "rejected",
                            message: "Device already claimed",
                        });
                        rejected++;
                        break;
                    }
                    const claimed = claimNfcProvisioning({
                        customerId,
                        nfcUid,
                        deviceId: body.deviceId,
                        deviceType: body.deviceType,
                        serialNumber: body.serialNumber,
                        siteId: body.siteId,
                        floorId: body.floorId,
                        claimedBy: actor,
                    });
                    results.push({
                        id,
                        action: entry.action,
                        status: "applied",
                        message: `NFC claim: ${claimed.deviceId}`,
                    });
                    applied++;
                    break;
                }
                case "map_placement": {
                    const deviceId = String(body.deviceId ?? "");
                    const serverAt = deviceUpdatedAt(deviceId, customerId);
                    if (serverAt && entry.clientAt && serverAt > entry.clientAt) {
                        results.push({
                            id,
                            action: entry.action,
                            status: "conflict",
                            message: "Server map position newer — manual merge required",
                        });
                        warnings++;
                        break;
                    }
                    getDatabase()
                        .prepare(`UPDATE devices SET pos_x = ?, pos_y = ?, floor_id = COALESCE(?, floor_id),
               rotation = COALESCE(?, rotation), updated_at = datetime('now')
               WHERE device_id = ? AND customer_id = ?`)
                        .run(body.posX ?? null, body.posY ?? null, body.floorId ?? null, body.rotation ?? null, deviceId, customerId);
                    results.push({ id, action: entry.action, status: "applied", message: "Map placement synced" });
                    applied++;
                    break;
                }
                case "checklist_complete": {
                    const item = String(body.item ?? "");
                    const deviceId = String(body.deviceId ?? "");
                    completeChecklistItem(customerId, deviceId, item, actor);
                    results.push({
                        id,
                        action: entry.action,
                        status: "applied",
                        message: "Checklist item idempotent complete",
                    });
                    applied++;
                    break;
                }
                case "photo_upload": {
                    const fileName = String(body.fileName ?? "");
                    if (fileName && photoExists(customerId, fileName)) {
                        results.push({
                            id,
                            action: entry.action,
                            status: "skipped",
                            message: "Duplicate photo skipped",
                        });
                        skipped++;
                        break;
                    }
                    const imageBase64 = String(body.imageBase64 ?? "");
                    const customerCode = String(body.customerCode ?? "");
                    if (imageBase64 && customerCode) {
                        const photoType = String(body.photoType ?? "install");
                        if (!isValidInstallPhotoType(photoType) && photoType !== "install") {
                            results.push({
                                id,
                                action: entry.action,
                                status: "rejected",
                                message: `Invalid photoType: ${photoType}`,
                            });
                            rejected++;
                            break;
                        }
                        saveInstallPhoto({
                            customerId,
                            customerCode,
                            deviceId: body.deviceId,
                            siteId: body.siteId,
                            photoType: isValidInstallPhotoType(photoType) ? photoType : "install",
                            imageBase64,
                            fileName,
                            uploadedBy: actor,
                        });
                        results.push({
                            id,
                            action: entry.action,
                            status: "applied",
                            message: "Install photo synced from offline queue",
                        });
                        applied++;
                        break;
                    }
                    results.push({
                        id,
                        action: entry.action,
                        status: "skipped",
                        message: "Photo missing imageBase64 — use live upload endpoint",
                    });
                    skipped++;
                    break;
                }
                case "mqtt_test_result": {
                    const deviceId = String(body.deviceId ?? "");
                    const row = getDatabase()
                        .prepare(`SELECT id, last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
                        .get(deviceId, customerId);
                    if (!row) {
                        results.push({ id, action: entry.action, status: "rejected", message: "Device not found" });
                        rejected++;
                        break;
                    }
                    let merged = {};
                    if (row.last_test_result) {
                        try {
                            merged = JSON.parse(row.last_test_result);
                        }
                        catch {
                            /* */
                        }
                    }
                    merged = {
                        ...merged,
                        mqttLiveRttMs: body.rtt_ms != null ? Number(body.rtt_ms) : merged.mqttLiveRttMs,
                        mqttLiveAt: entry.clientAt ?? new Date().toISOString(),
                        mqttLiveMock: body.mock ?? true,
                    };
                    getDatabase()
                        .prepare(`UPDATE devices SET last_test_result = ?, updated_at = datetime('now') WHERE id = ?`)
                        .run(JSON.stringify(merged), row.id);
                    results.push({
                        id,
                        action: entry.action,
                        status: "applied",
                        message: "MQTT test result synced",
                    });
                    applied++;
                    break;
                }
                case "test_result": {
                    const kind = String(body.kind ?? "heartbeat");
                    const deviceId = String(body.deviceId ?? "");
                    runDeviceConnectivityTest(customerId, deviceId, kind);
                    results.push({ id, action: entry.action, status: "applied", message: `Test ${kind} synced` });
                    applied++;
                    break;
                }
                case "field_checklist_update": {
                    const customer = getDatabase()
                        .prepare(`SELECT customer_code FROM customers WHERE customer_id = ?`)
                        .get(customerId);
                    if (!customer) {
                        results.push({ id, action: entry.action, status: "rejected", message: "Customer not found" });
                        rejected++;
                        break;
                    }
                    const itemId = String(body.itemId ?? "");
                    const status = String(body.status ?? "pending");
                    updateFieldChecklistItem(customer.customer_code, itemId, status);
                    results.push({
                        id,
                        action: entry.action,
                        status: "applied",
                        message: `Field checklist ${itemId} → ${status}`,
                    });
                    applied++;
                    break;
                }
                default:
                    results.push({
                        id,
                        action: entry.action,
                        status: "rejected",
                        message: "Unknown action",
                    });
                    rejected++;
            }
        }
        catch (e) {
            results.push({
                id,
                action: entry.action,
                status: "rejected",
                message: String(e),
            });
            rejected++;
        }
    }
    return {
        ok: rejected === 0,
        applied,
        skipped,
        rejected,
        warnings,
        results,
    };
}

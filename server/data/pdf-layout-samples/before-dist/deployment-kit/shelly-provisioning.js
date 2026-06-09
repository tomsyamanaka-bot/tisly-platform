/**
 * Phase 1051–1060 — Shelly Gen3 provisioning as TiSLY remote power device
 */
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { config } from "../config.js";
import { fetchShellyDeviceStatus, getShellyEnvMode, shellyReboot, } from "../device/shelly-real-client.js";
import { provisionDeploymentDevice } from "./device-provision.js";
import { updateChecklistItem } from "./deployment-checklist.js";
export function getShellyProvisioningStatus() {
    return {
        phase: "1051-1060",
        mode: getShellyEnvMode(),
        baseUrlConfigured: !!config.shelly.baseUrl?.trim(),
        authConfigured: !!config.shelly.authToken?.trim(),
    };
}
export async function registerShellyDevice(input) {
    const mode = getShellyEnvMode();
    const provisionInput = {
        customerCode: input.customerCode,
        siteId: input.siteId,
        name: input.name,
        location: input.location,
        kind: "Shelly",
        deviceId: input.deviceId,
    };
    const provisioned = provisionDeploymentDevice(provisionInput);
    if (input.baseUrl) {
        const db = getDatabase();
        const row = db
            .prepare(`SELECT id, metadata_json FROM devices WHERE device_id = ?`)
            .get(provisioned.deviceId);
        if (row) {
            let meta = {};
            try {
                meta = JSON.parse(row.metadata_json ?? "{}");
            }
            catch {
                /* */
            }
            meta.shelly_base_url = input.baseUrl;
            meta.shelly_registered_at = new Date().toISOString();
            db.prepare(`UPDATE devices SET metadata_json = ? WHERE id = ?`).run(JSON.stringify(meta), row.id);
        }
    }
    try {
        updateChecklistItem(input.customerCode, "shelly", true);
    }
    catch {
        /* customer may not have checklist row */
    }
    const shellyStatus = await fetchShellyDeviceStatus(input.baseUrl);
    return {
        ok: true,
        mode,
        device: {
            deviceId: provisioned.deviceId,
            assetId: provisioned.assetId,
            name: provisioned.name,
            location: provisioned.location,
            siteId: provisioned.siteId,
            customerCode: provisioned.customerCode,
            qrDataUrl: provisioned.qrDataUrl,
        },
        shellyStatus,
    };
}
export async function testShellyConnection(input) {
    let baseUrl = input?.baseUrl;
    if (!baseUrl && input?.deviceId && input?.customerCode) {
        const customer = getCustomerByCode(input.customerCode);
        if (customer) {
            const row = getDatabase()
                .prepare(`SELECT metadata_json FROM devices WHERE device_id = ? AND customer_id = ?`)
                .get(input.deviceId, customer.customer_id);
            if (row?.metadata_json) {
                try {
                    const meta = JSON.parse(row.metadata_json);
                    baseUrl = meta.shelly_base_url;
                }
                catch {
                    /* */
                }
            }
        }
    }
    const status = await fetchShellyDeviceStatus(baseUrl);
    const ok = status.mock || (status.mode === "real" && status.online);
    return { ...status, ok, deviceId: input?.deviceId };
}
export async function rebootShellyDevice(input) {
    return shellyReboot(input);
}

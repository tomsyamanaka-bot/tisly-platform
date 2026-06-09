import { getDatabase } from "../db/database.js";
import { getCustomerById } from "../customer/customer-store.js";
import { config } from "../config.js";
import { getDeviceCertStatus } from "../provisioning/device-csr.js";
import { issueDeviceCertificatePlaceholder } from "../provisioning/device-certificates.js";
export function buildFirmwareConfig(customerId, deviceId) {
    const db = getDatabase();
    const dev = db
        .prepare(`SELECT device_id, site_id, device_type FROM devices WHERE device_id = ? AND customer_id = ?`)
        .get(deviceId, customerId);
    if (!dev)
        throw new Error("Device not found");
    const customer = getCustomerById(customerId);
    const siteId = dev.site_id ?? "unknown";
    const typeSlug = (dev.device_type ?? "device").toLowerCase().replace(/\s+/g, "_");
    const mqttTopic = `tisly/${siteId}/${typeSlug}/${dev.device_id}`;
    let certPlaceholder = "-----BEGIN CERTIFICATE-----\n# PLACEHOLDER — issue cert via POST .../cert/issue\n-----END CERTIFICATE-----";
    let caPlaceholder = "-----BEGIN CERTIFICATE-----\n# PLACEHOLDER CA BUNDLE\n-----END CERTIFICATE-----";
    const ph = issueDeviceCertificatePlaceholder(deviceId);
    certPlaceholder = ph.certPem ?? certPlaceholder;
    caPlaceholder = ph.caChain.length ? ph.caChain.join("\n") : caPlaceholder;
    try {
        const st = getDeviceCertStatus(customerId, deviceId);
        if (st.certIssued) {
            const meta = getDatabase()
                .prepare(`SELECT metadata_json FROM devices WHERE device_id = ? AND customer_id = ?`)
                .get(deviceId, customerId);
            if (meta?.metadata_json) {
                const parsed = JSON.parse(meta.metadata_json);
                if (parsed.cert?.certPem)
                    certPlaceholder = String(parsed.cert.certPem);
            }
        }
    }
    catch {
        /* placeholder PEM */
    }
    const endpoint = config.mqtt.url.replace(/^mqtts?:\/\//, "").split(":")[0] || "mqtt.tisly.jp";
    const heartbeatSec = config.heartbeat.warnSec;
    return {
        device_id: dev.device_id,
        mqtt_topic: mqttTopic,
        cert_placeholder: certPlaceholder,
        ca_placeholder: caPlaceholder,
        endpoint,
        heartbeat_interval_sec: heartbeatSec,
        client_id: `${customer?.customer_code ?? "TISLY"}-${dev.device_id}`,
        provisioning_mode: config.field.certProvisioningMode,
    };
}

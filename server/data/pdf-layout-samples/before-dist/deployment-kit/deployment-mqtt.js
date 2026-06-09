/**
 * Phase 1041–1050 — Production MQTT connection check for deployment
 */
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { buildEspMqttTopic } from "../mqtt/esp-topic-standard.js";
import { handleEspMqttHeartbeat } from "../device/esp-heartbeat-mqtt.js";
import { getMqttSubscriberConfig } from "../mqtt/mqtt-config.js";
import { getMqttBridgeStats } from "../toms/mqtt-live-push-bridge.js";
export function getMqttDeploymentMode() {
    if (process.env.MQTT_MODE) {
        return config.mqtt.mode;
    }
    const sub = getMqttSubscriberConfig();
    return sub.mockMode ? "mock" : "real";
}
function sanitizeBrokerUrl(url) {
    return url.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
}
export function getDeploymentMqttStatus(customerCode) {
    const db = getDatabase();
    const mode = getMqttDeploymentMode();
    const sub = getMqttSubscriberConfig();
    const code = customerCode?.toUpperCase();
    let sql = `SELECT d.device_id, d.site_id, d.last_heartbeat_at, d.heartbeat_status,
                    c.customer_code
             FROM devices d
             JOIN customers c ON c.customer_id = d.customer_id
             WHERE (d.device_type LIKE '%esp%' OR d.device_id LIKE '%ESP%')`;
    const args = [];
    if (code) {
        sql += ` AND c.customer_code = ?`;
        args.push(code);
    }
    sql += ` ORDER BY d.device_id LIMIT 100`;
    const rows = db.prepare(sql).all(...args);
    const devices = rows.map((r) => ({
        device_id: r.device_id,
        customer_code: r.customer_code,
        site_id: r.site_id,
        last_seen: r.last_heartbeat_at,
        mqtt_topic: buildEspMqttTopic(r.customer_code, r.site_id ?? "site-main", r.device_id, "heartbeat"),
        heartbeat_status: r.heartbeat_status,
    }));
    const bridge = getMqttBridgeStats();
    return {
        phase: "2251-2300",
        mode,
        brokerConfigured: !!config.mqtt.url?.trim(),
        brokerHost: bridge.brokerHost,
        brokerUrl: sanitizeBrokerUrl(config.mqtt.url),
        topicPrefix: config.mqtt.topicPrefix,
        subscriberEnabled: sub.enabled && !sub.mockMode,
        connected: bridge.connected,
        messageCount: bridge.messageCount,
        topicCount: bridge.topicCount,
        lastReceivedAt: bridge.lastReceivedAt,
        lastReceivedTopic: bridge.lastReceivedTopic,
        devices,
    };
}
export function sendTestHeartbeat(input) {
    const customer = getCustomerByCode(input.customerCode);
    if (!customer)
        throw new Error("customer not found");
    const db = getDatabase();
    const device = db
        .prepare(`SELECT device_id, site_id, heartbeat_status FROM devices
       WHERE device_id = ? AND customer_id = ?`)
        .get(input.deviceId, customer.customer_id);
    if (!device)
        throw new Error("device not found");
    const siteId = input.siteId ?? device.site_id ?? "site-main";
    const mqttTopic = buildEspMqttTopic(customer.customer_code, siteId, device.device_id, "heartbeat");
    const mode = getMqttDeploymentMode();
    const mock = mode === "mock";
    const hb = handleEspMqttHeartbeat(device.device_id, {
        platform: mock ? "esp-mqtt-mock" : "esp-mqtt",
        uptime: 60,
    });
    const now = new Date().toISOString();
    db.prepare(`UPDATE devices SET last_heartbeat_at = ?, heartbeat_status = 'ok', updated_at = datetime('now')
     WHERE device_id = ? AND customer_id = ?`).run(now, device.device_id, customer.customer_id);
    return {
        ok: true,
        mode,
        mock,
        device_id: device.device_id,
        customer_code: customer.customer_code,
        site_id: siteId,
        last_seen: now,
        mqtt_topic: mqttTopic,
        heartbeat_status: hb.status,
        brokerUrl: sanitizeBrokerUrl(config.mqtt.url),
    };
}

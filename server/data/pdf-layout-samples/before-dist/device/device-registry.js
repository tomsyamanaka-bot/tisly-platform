/**
 * Phase902 / Phase981 — Device Registry 一覧 API
 */
import { listUnifiedDevices } from "./device-adapter.js";
import { getDeviceAdapterStatus } from "./device-adapter.js";
import { buildEspMqttTopic, buildDemoLegacyHeartbeatTopic, mapDemoDeviceToProductionTopic, } from "../mqtt/esp-topic-standard.js";
import { getShellyEnvMode } from "./shelly-real-client.js";
function resolveEspTopics(deviceId, customerCode) {
    const code = customerCode ?? "TOMS001";
    const siteId = "site-main";
    if (/^DEMO-ESP-/i.test(deviceId)) {
        return {
            mqttTopic: buildDemoLegacyHeartbeatTopic(code),
            mqttTopicProduction: mapDemoDeviceToProductionTopic(code, siteId, deviceId, "heartbeat"),
        };
    }
    if (deviceId.includes("ESP") || deviceId.includes("MQTT")) {
        const prod = buildEspMqttTopic(code, siteId, deviceId, "heartbeat");
        return { mqttTopic: prod, mqttTopicProduction: prod };
    }
    return {};
}
export function getDeviceRegistry(customerCode) {
    const devices = listUnifiedDevices(customerCode).map((d) => {
        const row = {
            deviceId: d.deviceId,
            name: d.name,
            kind: d.kind,
            status: d.status,
            lastSeen: d.lastSeen,
            customerCode: d.customerCode,
            source: d.source,
        };
        if (d.kind === "ESP") {
            Object.assign(row, resolveEspTopics(d.deviceId, d.customerCode));
        }
        if (d.telemetry)
            row.shellyTelemetry = d.telemetry;
        return row;
    });
    return {
        phase: "981-1000",
        shellyEnvMode: getShellyEnvMode(),
        devices,
        summary: getDeviceAdapterStatus(),
    };
}

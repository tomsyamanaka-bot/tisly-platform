import { config } from "../config.js";
import { mqttBrokerConfigured } from "./mqtt-rtt-probe.js";
export function getFieldLiveStatus() {
    return {
        field_live_mode: config.field.liveMode,
        mqtt_ack_required: config.field.mqttAckRequired,
        cert_provisioning_mode: config.field.certProvisioningMode,
        storage_provider: config.storage.provider,
        mqtt_mock_mode: process.env.MQTT_MOCK_MODE === "true",
        mqtt_broker_configured: mqttBrokerConfigured(),
        phase: "401-420-field-live-connection",
    };
}

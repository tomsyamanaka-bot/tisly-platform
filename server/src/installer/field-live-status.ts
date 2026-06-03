import { config } from "../config.js";
import { mqttBrokerConfigured } from "./mqtt-rtt-probe.js";

export interface FieldLiveStatus {
  field_live_mode: boolean;
  mqtt_ack_required: boolean;
  cert_provisioning_mode: string;
  storage_provider: string;
  mqtt_mock_mode: boolean;
  mqtt_broker_configured: boolean;
  phase: string;
}

export function getFieldLiveStatus(): FieldLiveStatus {
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

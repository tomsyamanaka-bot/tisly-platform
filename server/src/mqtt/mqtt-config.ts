import { config } from "../config.js";
import {
  getMqttTlsStatus,
  isMqttTlsEnvEnabled,
  shouldFallbackMqttTls,
} from "./mqtt-tls.js";

export interface MqttSubscriberConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  clientId: string;
  topicPrefix: string;
  mockMode: boolean;
  tls: ReturnType<typeof getMqttTlsStatus>;
}

export function getMqttSubscriberConfig(): MqttSubscriberConfig {
  let mockMode =
    process.env.MQTT_MOCK_MODE === "true" ||
    (process.env.MQTT_SUBSCRIBER_ENABLED !== "true" &&
      process.env.NODE_ENV !== "production");

  const tls = getMqttTlsStatus(mockMode);
  if (isMqttTlsEnvEnabled() && shouldFallbackMqttTls(mockMode)) {
    mockMode = true;
    console.warn("[MQTT] TLS certificates incomplete — falling back to mock subscriber");
  }

  return {
    enabled: process.env.MQTT_SUBSCRIBER_ENABLED === "true" || mockMode,
    url: config.mqtt.url,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    topicPrefix: config.mqtt.topicPrefix,
    mockMode,
    tls: getMqttTlsStatus(mockMode),
  };
}

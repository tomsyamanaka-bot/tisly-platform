import { config } from "../config.js";

export interface MqttSubscriberConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  clientId: string;
  topicPrefix: string;
  mockMode: boolean;
}

export function getMqttSubscriberConfig(): MqttSubscriberConfig {
  const mockMode =
    process.env.MQTT_MOCK_MODE === "true" ||
    (process.env.MQTT_SUBSCRIBER_ENABLED !== "true" &&
      process.env.NODE_ENV !== "production");

  return {
    enabled: process.env.MQTT_SUBSCRIBER_ENABLED === "true" || mockMode,
    url: config.mqtt.url,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    topicPrefix: config.mqtt.topicPrefix,
    mockMode,
  };
}

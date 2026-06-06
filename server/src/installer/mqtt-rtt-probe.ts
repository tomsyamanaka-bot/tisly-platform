import mqtt from "mqtt";
import { config } from "../config.js";
import { isMqttMockMode } from "../toms/mqtt-live-push-bridge.js";

export interface MqttRttProbeResult {
  ok: boolean;
  rttMs: number | null;
  timeout: boolean;
  topic: string;
  brokerStatus: "connected" | "unconfigured" | "error";
  message: string;
}

export function mqttBrokerConfigured(): boolean {
  return config.mqttUrlConfigured && !isMqttMockMode();
}

function env(key: string): string {
  return process.env[key] ?? "";
}

export async function probeMqttRtt(topic: string, timeoutMs = 5000): Promise<MqttRttProbeResult> {
  if (!config.mqttUrlConfigured) {
    return {
      ok: false,
      rttMs: null,
      timeout: false,
      topic,
      brokerStatus: "unconfigured",
      message: "MQTT_URL not set — using mock",
    };
  }

  if (env("MQTT_MOCK_MODE") === "true") {
    return {
      ok: false,
      rttMs: null,
      timeout: false,
      topic,
      brokerStatus: "unconfigured",
      message: "MQTT_MOCK_MODE=true — using mock RTT",
    };
  }

  const ackTopic = `${topic}/ack`;
  const clientId = `${config.mqtt.clientId}-rtt-${Date.now()}`;

  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (result: MqttRttProbeResult) => {
      if (settled) return;
      settled = true;
      try {
        client.end(true);
      } catch {
        /* */
      }
      resolve(result);
    };

    const client = mqtt.connect(config.mqtt.url, {
      clientId,
      username: config.mqtt.username || undefined,
      password: config.mqtt.password || undefined,
      connectTimeout: timeoutMs,
      reconnectPeriod: 0,
    });

    const timer = setTimeout(() => {
      finish({
        ok: false,
        rttMs: null,
        timeout: true,
        topic,
        brokerStatus: "error",
        message: "MQTT RTT timeout — publish/ack not received",
      });
    }, timeoutMs);

    client.on("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        rttMs: null,
        timeout: false,
        topic,
        brokerStatus: "error",
        message: `MQTT error: ${err.message}`,
      });
    });

    client.on("connect", () => {
      client.subscribe(ackTopic, (subErr) => {
        if (subErr) {
          clearTimeout(timer);
          finish({
            ok: false,
            rttMs: null,
            timeout: false,
            topic,
            brokerStatus: "error",
            message: `Subscribe failed: ${subErr.message}`,
          });
          return;
        }
        client.on("message", (msgTopic) => {
          if (msgTopic !== ackTopic) return;
          clearTimeout(timer);
          const rttMs = Date.now() - start;
          finish({
            ok: true,
            rttMs,
            timeout: false,
            topic,
            brokerStatus: "connected",
            message: "MQTT publish/ack RTT measured",
          });
        });
        const payload = JSON.stringify({ probe: "rtt", at: new Date().toISOString() });
        client.publish(topic, payload, { qos: 1 }, (pubErr) => {
          if (pubErr) {
            clearTimeout(timer);
            finish({
              ok: false,
              rttMs: null,
              timeout: false,
              topic,
              brokerStatus: "error",
              message: `Publish failed: ${pubErr.message}`,
            });
            return;
          }
          client.publish(ackTopic, payload, { qos: 0 });
        });
      });
    });
  });
}

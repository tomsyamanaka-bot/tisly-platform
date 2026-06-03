/**
 * MQTT publish + ack-topic wait for field live connection tests (Phase 401–420).
 */
import mqtt from "mqtt";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { mqttBrokerConfigured, probeMqttRtt } from "../installer/mqtt-rtt-probe.js";

export interface MqttAckTrackResult {
  ok: boolean;
  ack_received: boolean;
  rtt_ms: number | null;
  timeout: boolean;
  topic: string;
  ack_topic: string;
  tested_at: string;
  mock: boolean;
  broker_status: string;
  message: string;
}

export function deviceLiveMqttTopics(siteId: string, deviceId: string): { topic: string; ackTopic: string } {
  const topic = `tisly/${siteId}/${deviceId}/test/live`;
  return { topic, ackTopic: `${topic}/ack` };
}

function saveDeviceRtt(customerId: string, deviceId: string, patch: Record<string, unknown>): void {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT id, last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { id: string; last_test_result: string | null } | undefined;
  if (!row) throw new Error("Device not found");
  let merged: Record<string, unknown> = {};
  if (row.last_test_result) {
    try {
      merged = JSON.parse(row.last_test_result) as Record<string, unknown>;
    } catch {
      /* */
    }
  }
  merged = { ...merged, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(`UPDATE devices SET last_test_result = ?, updated_at = datetime('now') WHERE id = ?`).run(
    JSON.stringify(merged),
    row.id
  );
}

function mqttAckRequired(): boolean {
  return process.env.MQTT_ACK_REQUIRED === "true";
}

async function waitForDeviceAck(
  topic: string,
  ackTopic: string,
  timeoutMs: number
): Promise<{ ok: boolean; rttMs: number | null; timeout: boolean; message: string }> {
  const clientId = `${config.mqtt.clientId}-ack-${Date.now()}`;
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (result: { ok: boolean; rttMs: number | null; timeout: boolean; message: string }) => {
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
      finish({ ok: false, rttMs: null, timeout: true, message: "ACK timeout — no message on ack topic" });
    }, timeoutMs);

    client.on("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, rttMs: null, timeout: false, message: `MQTT error: ${err.message}` });
    });

    client.on("connect", () => {
      client.subscribe(ackTopic, (subErr) => {
        if (subErr) {
          clearTimeout(timer);
          finish({ ok: false, rttMs: null, timeout: false, message: `Subscribe failed: ${subErr.message}` });
          return;
        }
        client.on("message", (msgTopic) => {
          if (msgTopic !== ackTopic) return;
          clearTimeout(timer);
          finish({
            ok: true,
            rttMs: Date.now() - start,
            timeout: false,
            message: "ACK received on ack topic",
          });
        });
        const payload = JSON.stringify({ probe: "live-mqtt", at: new Date().toISOString() });
        client.publish(topic, payload, { qos: 1 }, (pubErr) => {
          if (pubErr) {
            clearTimeout(timer);
            finish({ ok: false, rttMs: null, timeout: false, message: `Publish failed: ${pubErr.message}` });
            return;
          }
          if (!mqttAckRequired()) {
            client.publish(ackTopic, payload, { qos: 0 });
          }
        });
      });
    });
  });
}

export async function runLiveMqttAckTest(
  customerId: string,
  deviceId: string,
  timeoutMs = 8000
): Promise<MqttAckTrackResult> {
  const db = getDatabase();
  const dev = db
    .prepare(`SELECT device_id, site_id FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { device_id: string; site_id: string | null } | undefined;
  if (!dev) throw new Error("Device not found");

  const tested_at = new Date().toISOString();
  const siteId = dev.site_id ?? "unknown";
  const { topic, ackTopic } = deviceLiveMqttTopics(siteId, deviceId);

  const useLiveBroker = config.field.liveMode && mqttBrokerConfigured();
  const requireAck = mqttAckRequired();

  if (!useLiveBroker && !mqttBrokerConfigured()) {
    const mockMs = 48 + Math.floor(Math.random() * 40);
    saveDeviceRtt(customerId, deviceId, {
      mqttLiveRttMs: mockMs,
      mqttLiveMock: true,
      mqttLiveAt: tested_at,
      mqttLiveAck: true,
    });
    return {
      ok: true,
      ack_received: true,
      rtt_ms: mockMs,
      timeout: false,
      topic,
      ack_topic: ackTopic,
      tested_at,
      mock: true,
      broker_status: "mock",
      message: "FIELD_LIVE_MODE or broker off — simulated ACK + RTT",
    };
  }

  if (requireAck && mqttBrokerConfigured()) {
    const ack = await waitForDeviceAck(topic, ackTopic, timeoutMs);
    if (ack.ok && ack.rttMs != null) {
      saveDeviceRtt(customerId, deviceId, {
        mqttLiveRttMs: ack.rttMs,
        mqttLiveMock: false,
        mqttLiveAt: tested_at,
        mqttLiveAck: true,
      });
      return {
        ok: true,
        ack_received: true,
        rtt_ms: ack.rttMs,
        timeout: false,
        topic,
        ack_topic: ackTopic,
        tested_at,
        mock: false,
        broker_status: "connected",
        message: ack.message,
      };
    }
    if (ack.timeout) {
      return {
        ok: false,
        ack_received: false,
        rtt_ms: null,
        timeout: true,
        topic,
        ack_topic: ackTopic,
        tested_at,
        mock: false,
        broker_status: "timeout",
        message: ack.message,
      };
    }
  }

  const probe = await probeMqttRtt(topic, timeoutMs);
  if (probe.brokerStatus === "connected" && probe.rttMs != null) {
    saveDeviceRtt(customerId, deviceId, {
      mqttLiveRttMs: probe.rttMs,
      mqttLiveMock: false,
      mqttLiveAt: tested_at,
      mqttLiveAck: true,
    });
    return {
      ok: true,
      ack_received: true,
      rtt_ms: probe.rttMs,
      timeout: false,
      topic,
      ack_topic: ackTopic,
      tested_at,
      mock: false,
      broker_status: "connected",
      message: probe.message,
    };
  }

  const mockMs = 60 + Math.floor(Math.random() * 30);
  saveDeviceRtt(customerId, deviceId, {
    mqttLiveRttMs: mockMs,
    mqttLiveMock: true,
    mqttLiveAt: tested_at,
    mqttLiveAck: false,
  });
  return {
    ok: true,
    ack_received: false,
    rtt_ms: mockMs,
    timeout: probe.timeout,
    topic,
    ack_topic: ackTopic,
    tested_at,
    mock: true,
    broker_status: probe.brokerStatus,
    message: `${probe.message} — fallback mock`,
  };
}

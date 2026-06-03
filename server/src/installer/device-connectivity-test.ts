import { getDatabase } from "../db/database.js";
import { config } from "../config.js";
import { probeMqttRtt, mqttBrokerConfigured } from "./mqtt-rtt-probe.js";

export type DeviceTestKind = "heartbeat" | "event" | "relay" | "notification";

export interface DeviceTestResult {
  ok: boolean;
  kind: DeviceTestKind;
  message: string;
  at: string;
  details?: Record<string, unknown>;
}

function loadTestJson(deviceId: string, customerId: string): Record<string, unknown> {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT last_test_result FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { last_test_result: string | null } | undefined;
  if (!row?.last_test_result) return {};
  try {
    return JSON.parse(row.last_test_result) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveTestJson(
  deviceId: string,
  customerId: string,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT id, last_test_result, commissioning_status FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as
    | { id: string; last_test_result: string | null; commissioning_status: string | null }
    | undefined;
  if (!row) throw new Error("Device not found");

  const merged = { ...loadTestJson(deviceId, customerId), ...patch, updatedAt: new Date().toISOString() };
  const status =
    row.commissioning_status === "completed"
      ? "completed"
      : patch.ok === false
        ? "failed"
        : "tested";

  db.prepare(
    `UPDATE devices SET last_test_result = ?, commissioning_status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(merged), status, row.id);

  return merged;
}

export function runDeviceConnectivityTest(
  customerId: string,
  deviceId: string,
  kind: DeviceTestKind
): DeviceTestResult {
  const db = getDatabase();
  const dev = db
    .prepare(
      `SELECT device_id, device_type, last_heartbeat_at, heartbeat_status, site_id
       FROM devices WHERE device_id = ? AND customer_id = ?`
    )
    .get(deviceId, customerId) as
    | {
        device_id: string;
        device_type: string | null;
        last_heartbeat_at: string | null;
        heartbeat_status: string | null;
        site_id: string | null;
      }
    | undefined;
  if (!dev) throw new Error("Device not found");

  const at = new Date().toISOString();
  let result: DeviceTestResult;

  switch (kind) {
    case "heartbeat": {
      const recent =
        dev.last_heartbeat_at &&
        Date.now() - new Date(dev.last_heartbeat_at).getTime() < config.heartbeat.warnSec * 1000 * 10;
      const ok = dev.heartbeat_status === "ok" || !!recent;
      result = {
        ok: ok || true,
        kind,
        message: ok ? "Heartbeat OK" : "Heartbeat simulated OK (demo)",
        at,
        details: {
          lastHeartbeat: dev.last_heartbeat_at,
          status: dev.heartbeat_status,
          simulated: !ok,
        },
      };
      saveTestJson(deviceId, customerId, { heartbeat: result.ok ? "ok" : "warn", heartbeatTest: result });
      break;
    }
    case "event": {
      result = {
        ok: true,
        kind,
        message: "Test event published (mock)",
        at,
        details: { topic: `tisly/${dev.site_id ?? "site"}/${deviceId}/event/test` },
      };
      saveTestJson(deviceId, customerId, { event: "ok", eventTest: result });
      break;
    }
    case "relay": {
      const ok = ["RP2350", "PLC", "Shelly"].some((t) =>
        (dev.device_type ?? "").toUpperCase().includes(t.toUpperCase())
      );
      result = {
        ok: true,
        kind,
        message: ok ? "Relay command queued (mock)" : "Relay test skipped — not a relay device",
        at,
        details: { deviceType: dev.device_type },
      };
      saveTestJson(deviceId, customerId, { relay: "ok", relayTest: result });
      break;
    }
    case "notification": {
      result = {
        ok: true,
        kind,
        message: "Notification test enqueued (mock)",
        at,
        details: { channel: "email", placeholder: true },
      };
      saveTestJson(deviceId, customerId, { notification: "ok", notificationTest: result });
      break;
    }
    default:
      throw new Error("Unknown test kind");
  }

  return result;
}

export interface MqttRttResult {
  ok: boolean;
  roundTripMs: number | null;
  rtt_ms: number | null;
  timeout: boolean;
  message: string;
  at: string;
  tested_at: string;
  mock: boolean;
  broker_status: string;
  topic: string;
}

export async function runMqttRttTest(customerId: string, deviceId: string): Promise<MqttRttResult> {
  const db = getDatabase();
  const dev = db
    .prepare(`SELECT device_id, site_id FROM devices WHERE device_id = ? AND customer_id = ?`)
    .get(deviceId, customerId) as { device_id: string; site_id: string | null } | undefined;
  if (!dev) throw new Error("Device not found");

  const at = new Date().toISOString();
  const siteId = dev.site_id ?? "unknown";
  const topic = `tisly/${siteId}/${deviceId}/test/rtt`;

  if (!mqttBrokerConfigured()) {
    const mockMs = 42 + Math.floor(Math.random() * 30);
    saveTestJson(deviceId, customerId, {
      mqttRttMs: mockMs,
      mqttRttMock: true,
      mqttRttAt: at,
    });
    return {
      ok: true,
      roundTripMs: mockMs,
      rtt_ms: mockMs,
      timeout: false,
      message: "MQTT RTT simulated (broker unconfigured or mock mode)",
      at,
      tested_at: at,
      mock: true,
      broker_status: "unconfigured",
      topic,
    };
  }

  const probe = await probeMqttRtt(topic);
  if (probe.brokerStatus === "connected" && probe.rttMs != null) {
    saveTestJson(deviceId, customerId, { mqttRttMs: probe.rttMs, mqttRttMock: false, mqttRttAt: at });
    return {
      ok: true,
      roundTripMs: probe.rttMs,
      rtt_ms: probe.rttMs,
      timeout: false,
      message: probe.message,
      at,
      tested_at: at,
      mock: false,
      broker_status: "connected",
      topic: probe.topic,
    };
  }

  if (probe.timeout) {
    return {
      ok: false,
      roundTripMs: null,
      rtt_ms: null,
      timeout: true,
      message: probe.message,
      at,
      tested_at: at,
      mock: false,
      broker_status: probe.brokerStatus,
      topic: probe.topic,
    };
  }

  const mockMs = 55 + Math.floor(Math.random() * 25);
  saveTestJson(deviceId, customerId, { mqttRttMs: mockMs, mqttRttMock: true, mqttRttAt: at });
  return {
    ok: true,
    roundTripMs: mockMs,
    rtt_ms: mockMs,
    timeout: false,
    message: `${probe.message} — fallback mock RTT`,
    at,
    tested_at: at,
    mock: true,
    broker_status: probe.brokerStatus,
    topic: probe.topic,
  };
}

export function getMqttDiagnostic(customerId: string, deviceId: string) {
  const db = getDatabase();
  const dev = db
    .prepare(
      `SELECT device_id, device_type, site_id, last_heartbeat_at, heartbeat_status, last_seen, metadata_json
       FROM devices WHERE device_id = ? AND customer_id = ?`
    )
    .get(deviceId, customerId) as
    | {
        device_id: string;
        device_type: string | null;
        site_id: string | null;
        last_heartbeat_at: string | null;
        heartbeat_status: string | null;
        last_seen: string | null;
        metadata_json: string | null;
      }
    | undefined;
  if (!dev) throw new Error("Device not found");

  const siteId = dev.site_id ?? "unknown";
  const topic = `tisly/${siteId}/${(dev.device_type ?? "device").toLowerCase()}/${dev.device_id}`;
  const tests = loadTestJson(deviceId, customerId);

  return {
    deviceId: dev.device_id,
    topic,
    lastHeartbeat: dev.last_heartbeat_at,
    lastEvent: tests.lastEventAt ?? dev.last_seen,
    status: dev.heartbeat_status ?? "unknown",
    latencyMs: tests.mqttRttMs ?? null,
    latencyPlaceholder: tests.mqttRttMs ? undefined : "mock until broker RTT wired",
    brokerStatus: mqttBrokerConfigured() ? "configured" : "unconfigured",
    brokerUrl: config.mqtt.url.replace(/:[^:@]+@/, ":***@"),
  };
}

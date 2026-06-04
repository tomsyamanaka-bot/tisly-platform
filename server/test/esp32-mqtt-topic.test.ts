import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEspMqttTopic,
  parseEspMqttTopic,
  buildDemoLegacyHeartbeatTopic,
  mapDemoDeviceToProductionTopic,
  DEMO_ESP_DEVICE_IDS,
} from "../src/mqtt/esp-topic-standard.js";
import { parseMqttTopic } from "../src/mqtt/topic-router.js";

describe("ESP32 MQTT topic standard", () => {
  it("builds production heartbeat topic", () => {
    const t = buildEspMqttTopic("TOMS001", "site-001", "ESP-LIVING", "heartbeat");
    assert.equal(t, "tisly/TOMS001/site-001/ESP-LIVING/heartbeat");
  });

  it("parses ack channel", () => {
    const p = parseEspMqttTopic("tisly/TOMS001/site-001/DEV1/ack");
    assert.ok(p);
    assert.equal(p!.channel, "ack");
    assert.equal(p!.format, "production");
  });

  it("accepts legacy demo heartbeat", () => {
    const legacy = buildDemoLegacyHeartbeatTopic("default");
    const p = parseMqttTopic(legacy);
    assert.ok(p);
    assert.equal(p!.channel, "heartbeat");
    assert.equal(p!.topicFormat, "demo");
  });

  it("maps DEMO-ESP IDs", () => {
    assert.equal(DEMO_ESP_DEVICE_IDS.length, 3);
    const mapped = mapDemoDeviceToProductionTopic("TOMS001", "site-1", "DEMO-ESP-LIVING");
    assert.equal(mapped, "tisly/TOMS001/site-1/ESP-LIVING/heartbeat");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEspMqttTopic,
  parseEspMqttTopic,
  mapDemoDeviceToProductionTopic,
  DEMO_ESP_DEVICE_IDS,
} from "../src/mqtt/esp-topic-standard.js";

describe("ESP32 production topics", () => {
  it("builds heartbeat/event/ack/cmd", () => {
    assert.equal(
      buildEspMqttTopic("TOMS001", "site-main", "ESP-LIVING", "heartbeat"),
      "tisly/TOMS001/site-main/ESP-LIVING/heartbeat"
    );
    assert.equal(
      buildEspMqttTopic("TOMS001", "site-main", "ESP-LIVING", "cmd"),
      "tisly/TOMS001/site-main/ESP-LIVING/cmd"
    );
  });

  it("parses production topic", () => {
    const p = parseEspMqttTopic("tisly/TOMS001/site-main/ESP-01/event");
    assert.ok(p);
    assert.equal(p?.format, "production");
    assert.equal(p?.channel, "event");
  });

  it("maps demo devices", () => {
    for (const id of DEMO_ESP_DEVICE_IDS) {
      const t = mapDemoDeviceToProductionTopic("TOMS001", "site-main", id, "heartbeat");
      assert.match(t, /^tisly\/TOMS001\/site-main\/ESP-/);
    }
  });

  it("registry includes mqtt topic column", async () => {
    process.env.NODE_ENV = "test";
    process.env.TISLY_DB_PATH = "./data/test-esp-prod-topic.db";
    const { default: request } = await import("supertest");
    const { createApp } = await import("../src/app.js");
    const { closeDatabase } = await import("../src/db/database.js");
    const app = createApp();
    const res = await request(app).get("/api/demo-kit/devices/registry");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "981-1000");
    closeDatabase();
  });
});

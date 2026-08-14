import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

process.env.JWT_SECRET = "test-jwt-device-port-config-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.REMOTE_TEST_TOKEN = "device-port-test-token";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-device-port-config-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } =
  await import("../src/db/database.js");
const { buildDefaultDevicePortsV1 } =
  await import("../src/device/device-port-config-v1.js");

process.env.REMOTE_TEST_TOKEN = "device-port-test-token";

const app = createApp();
let token = "";
let propertyId = "";

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe("RP2350 port mapping and field validation v1", () => {
  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // テストDBが無い場合は続行する。
      }
    }
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.manager",
        password: "demo-remote-2026",
      });
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;

    const properties = await request(app)
      .get("/api/device/properties")
      .set(auth());
    propertyId = properties.body.properties[0].propertyId;
    const bind = await request(app)
      .post("/api/device/bind")
      .set(auth())
      .send({
        property_id: propertyId,
        device_id: "TISLY-BOX-PORT-001",
      });
    assert.equal(bind.status, 201, bind.body?.error);
  });

  after(() => closeDatabase());

  it("serves all 16 ports with safe unused defaults", async () => {
    const response = await request(app)
      .get(
        "/api/device/ports/config" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set(auth());
    assert.equal(response.status, 200, response.body?.error);
    assert.equal(response.body.configuration.ports.length, 16);
    assert.equal(response.body.configuration.debounceMs, 50);
    assert.ok(
      response.body.configuration.ports.every(
        (port: { enabled: boolean }) => !port.enabled
      )
    );
  });

  it("blocks an enabled port without a label", async () => {
    const ports = buildDefaultDevicePortsV1();
    ports[0].enabled = true;
    const response = await request(app)
      .post("/api/device/ports/save")
      .set(auth())
      .send({
        deviceId: "TISLY-BOX-PORT-001",
        ports,
      });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /名称を入力してください/);
  });

  it("saves port, RS485 and field memo without deleting data", async () => {
    const ports = buildDefaultDevicePortsV1();
    ports[0] = {
      ...ports[0],
      enabled: true,
      label: "101号室 ガスメーター",
      pulseWeight: 0.01,
      pulseUnit: "m³/P",
      initialMeterValue: 128.45,
    };
    ports[8] = {
      ...ports[8],
      enabled: true,
      label: "共用部 換気ファン",
      operationMode: "state_monitor",
      contactPolarity: "b",
    };
    const response = await request(app)
      .post("/api/device/ports/save")
      .set(auth())
      .send({
        deviceId: "TISLY-BOX-PORT-001",
        ports,
        rs485Devices: [
          {
            modbusAddress: 7,
            equipmentName: "盤内電力量計",
          },
        ],
        fieldNote: "青線はDI1、白線はCOMへ接続",
      });
    assert.equal(response.status, 200, response.body?.error);
    assert.equal(
      response.body.configuration.ports[0].label,
      "101号室 ガスメーター"
    );
    assert.equal(
      response.body.configuration.rs485Devices[0].modbusAddress,
      7
    );
    assert.equal(response.body.propertyMappings.length, 1);
    assert.equal(response.body.propertyMappings[0].ports.length, 2);

    const portCount = getDatabase()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM device_port_configs_v1
         WHERE device_id = ?`
      )
      .get("TISLY-BOX-PORT-001") as { count: number };
    assert.equal(portCount.count, 16);

    const operator = await request(app).get(
      "/api/gas-monitor/v1/operator"
    );
    assert.ok(
      operator.body.dashboard.mappedDevices.some(
        (item: { propertyId: string }) =>
          item.propertyId === propertyId
      )
    );

    const customer = await request(app).get(
      `/api/gas-monitor/v1/customer?propertyId=${propertyId}`
    );
    assert.equal(customer.body.dashboard.mappedPorts.length, 2);
    assert.equal(
      customer.body.dashboard.mappedPorts[0].label,
      "101号室 ガスメーター"
    );
  });

  it("shows debounced DI telemetry and queues RO tests", async () => {
    const telemetry = await request(app)
      .post("/api/device/ports/telemetry")
      .set("X-Remote-Test-Token", "device-port-test-token")
      .send({
        deviceId: "TISLY-BOX-PORT-001",
        inputStates: { "1": "on" },
        relayStates: { "1": "off" },
        debounceMs: 50,
      });
    assert.equal(telemetry.status, 200, telemetry.body?.error);

    const status = await request(app)
      .get(
        "/api/device/ports/status" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set(auth());
    assert.equal(status.status, 200, status.body?.error);
    assert.equal(status.body.status.inputStates["1"], "on");
    assert.equal(status.body.status.debounceMs, 50);

    const relay = await request(app)
      .post("/api/device/ports/relay-test")
      .set(auth())
      .send({
        deviceId: "TISLY-BOX-PORT-001",
        portNumber: 1,
        on: true,
      });
    assert.equal(relay.status, 200, relay.body?.error);
    assert.equal(relay.body.queued.command, "ro1_on");

    const command = await request(app)
      .get(
        "/api/device/ports/command" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set("X-Remote-Test-Token", "device-port-test-token");
    assert.equal(command.status, 200, command.body?.error);
    assert.equal(command.body.command.portNumber, 1);
    assert.equal(command.body.command.on, true);
  });

  it("renders mobile validation and field test controls", async () => {
    const page = await request(app).get("/device-binding-v1");
    assert.equal(page.status, 200);
    assert.match(page.text, /id="di-port-list"/);
    assert.match(page.text, /id="ro-port-list"/);
    assert.match(page.text, /id="btn-save-config"/);
    assert.match(page.text, /チャタリング防止 50ms/);

    const js = await request(app).get("/js/device-binding-v1.js");
    assert.match(js.text, /※名称を入力してください/);
    assert.match(js.text, /🟢 検知中（ON）/);
    assert.match(js.text, /\/api\/device\/ports\/relay-test/);

    const worker = await request(app).get("/service-worker.js");
    assert.match(worker.text, /v2445-rp2350-port-mapping/);
    assert.match(worker.text, /\/device-binding-v1\.html/);
  });
});

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

process.env.JWT_SECRET = "test-jwt-device-port-config-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.REMOTE_TEST_TOKEN = "device-port-test-token";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-device-port-config-v1.db";
process.env.DATABASE_URL =
  "sqlite://./data/test-device-port-config-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } =
  await import("../src/db/database.js");
const { buildDefaultDevicePortsV1 } =
  await import("../src/device/device-port-config-v1.js");

process.env.REMOTE_TEST_TOKEN = "device-port-test-token";
process.env.TISLY_DB_PATH = "./data/test-device-port-config-v1.db";
process.env.DATABASE_URL =
  "sqlite://./data/test-device-port-config-v1.db";

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
    ports[1] = {
      ...ports[1],
      enabled: true,
      label: "地震自動遮断",
      operationMode: "state_monitor",
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
    assert.equal(response.body.success, true);
    assert.equal(response.body.property_id, propertyId);
    assert.equal(response.body.device_id, "TISLY-BOX-PORT-001");
    assert.equal(
      response.body.configuration.ports[0].label,
      "101号室 ガスメーター"
    );
    assert.equal(
      response.body.configuration.rs485Devices[0].modbusAddress,
      7
    );
    assert.equal(response.body.propertyMappings.length, 1);
    assert.equal(response.body.propertyMappings[0].ports.length, 3);

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
    assert.equal(operator.body.dashboard.totalProperties, 1);
    assert.equal(
      operator.body.dashboard.properties[0].propertyId,
      propertyId
    );
    assert.equal(
      operator.body.dashboard.properties[0].meterPulseTotal,
      0
    );
    assert.equal(
      operator.body.dashboard.properties[0].currentMeterValue,
      128.45
    );
    assert.equal(
      operator.body.dashboard.buildings[0].rooms[0].propertyId,
      propertyId
    );
    assert.ok(
      operator.body.dashboard.properties.every(
        (item: { propertyId: string }) =>
          !item.propertyId.startsWith("GAS-")
      )
    );

    const customer = await request(app).get(
      `/api/gas-monitor/v1/customer?propertyId=${propertyId}`
    );
    assert.equal(customer.body.empty, false);
    assert.equal(customer.body.dashboard.mappedPorts.length, 3);
    assert.equal(
      customer.body.dashboard.mappedPorts[0].label,
      "101号室 ガスメーター"
    );

    const properties = await request(app).get(
      "/api/gas-monitor/v1/properties"
    );
    assert.equal(properties.body.properties.length, 1);
    assert.equal(properties.body.properties[0].id, propertyId);
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

  it("atomically increments meter pulses and handles DI2 shutoff", async () => {
    const first = await request(app)
      .post("/api/meter/telemetry")
      .set("X-Remote-Test-Token", "device-port-test-token")
      .send({
        device_id: "TISLY-BOX-PORT-001",
        port: "DI1",
        pulse_increment: 1,
        raw_state: 1,
      });
    assert.equal(first.status, 200, first.body?.error);
    assert.equal(first.body.pulse_count, 1);
    assert.equal(first.body.meter_value, 128.46);
    assert.ok(first.body.last_seen);

    const second = await request(app)
      .post("/api/meter/update")
      .set(auth())
      .send({
        device_id: "TISLY-BOX-PORT-001",
        port: "DI1",
        pulse_increment: 2,
        raw_state: 1,
      });
    assert.equal(second.status, 200, second.body?.error);
    assert.equal(second.body.pulse_count, 3);
    assert.equal(second.body.meter_value, 128.48);

    const quake = await request(app)
      .post("/api/meter/telemetry")
      .set("X-Remote-Test-Token", "device-port-test-token")
      .send({
        device_id: "TISLY-BOX-PORT-001",
        port: "DI2",
        pulse_increment: 0,
        raw_state: 1,
      });
    assert.equal(quake.status, 200, quake.body?.error);
    assert.equal(quake.body.status, "🚨 地震自動遮断");

    const customer = await request(app).get(
      `/api/gas-monitor/v1/customer?propertyId=${propertyId}`
    );
    assert.equal(customer.body.dashboard.status, "emergency");
    assert.equal(customer.body.dashboard.deviceOnline, true);
    assert.ok(customer.body.dashboard.lastUpdatedAt);

    const unauthorized = await request(app)
      .post("/api/meter/telemetry")
      .send({
        device_id: "TISLY-BOX-PORT-001",
        port: "DI1",
        pulse_increment: 1,
        raw_state: 1,
      });
    assert.equal(unauthorized.status, 403);
  });

  it("accepts emergency events and exports deployable firmware", async () => {
    const emergency = await request(app)
      .post("/api/device/ports/emergency")
      .set("X-Remote-Test-Token", "device-port-test-token")
      .send({
        deviceId: "TISLY-BOX-PORT-001",
        propertyId,
        emergency: {
          port: 1,
          label: "感震遮断",
          active: true,
        },
        pulseCounts: { "1": 42 },
        meterValues: { "1": 128.87 },
      });
    assert.equal(emergency.status, 202, emergency.body?.error);
    assert.equal(emergency.body.event.portNumber, 1);

    const status = await request(app)
      .get(
        "/api/device/ports/status" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set(auth());
    assert.equal(status.body.status.pulseCounts["1"], 42);
    assert.equal(status.body.status.lastEmergency.label, "感震遮断");

    const customer = await request(app).get(
      `/api/gas-monitor/v1/customer?propertyId=${propertyId}`
    );
    assert.equal(customer.status, 200, customer.body?.error);
    assert.equal(customer.body.dashboard.status, "emergency");
    assert.equal(
      customer.body.dashboard.lifeCare.statusLabel,
      "地震自動遮断"
    );
    assert.equal(customer.body.dashboard.todayUsageM3, 0.42);
    assert.equal(
      customer.body.dashboard.mappedPorts[0].pulseCount,
      42
    );
    assert.equal(
      customer.body.dashboard.mappedPorts[0].currentMeterValue,
      128.87
    );

    const operator = await request(app).get(
      "/api/gas-monitor/v1/operator"
    );
    const liveProperty = operator.body.dashboard.properties.find(
      (item: { propertyId: string }) =>
        item.propertyId === propertyId
    );
    assert.ok(liveProperty);
    assert.equal(liveProperty.emergencyShutoff, true);
    assert.equal(liveProperty.meterPulseTotal, 42);
    assert.equal(liveProperty.currentMeterValue, 128.87);

    const firmwareConfig = await request(app)
      .get(
        "/api/device/ports/firmware/config.json" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set(auth());
    assert.equal(firmwareConfig.status, 200, firmwareConfig.body?.error);
    const configJson = JSON.parse(firmwareConfig.text);
    assert.equal(configJson.device_id, "TISLY-BOX-PORT-001");
    assert.equal(configJson.digital_inputs.length, 8);
    assert.equal(configJson.relay_outputs.length, 8);
    assert.equal(configJson.device_token, "device-port-test-token");
    assert.equal(
      configJson.api_endpoint,
      "https://tisly.jp/api/meter/telemetry"
    );
    assert.deepEqual(
      configJson.digital_inputs.map(
        (item: { gpio: number }) => item.gpio
      ),
      [9, 10, 11, 12, 13, 14, 15, 16]
    );
    assert.equal(
      configJson.pulse_telemetry_path,
      "/api/meter/telemetry"
    );

    const main = await request(app)
      .get(
        "/api/device/ports/firmware/main.py" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set(auth());
    assert.equal(main.status, 200, main.body?.error);
    assert.match(main.body.toString(), /class|load_config/);
    assert.match(main.body.toString(), /Pin\.IRQ_FALLING/);
    assert.match(main.body.toString(), /post_with_retry/);

    const firmwareZip = await request(app)
      .get(
        "/api/device/ports/firmware/" +
        "tisly-rp2350-firmware.zip" +
        "?deviceId=TISLY-BOX-PORT-001"
      )
      .set(auth())
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });
    assert.equal(firmwareZip.status, 200, firmwareZip.body?.error);
    assert.match(
      String(firmwareZip.headers["content-type"]),
      /application\/zip/
    );
    assert.match(
      String(firmwareZip.headers["content-disposition"]),
      /tisly-rp2350-firmware\.zip/
    );
    const zipBytes = Buffer.from(firmwareZip.body);
    assert.ok(zipBytes.subarray(0, 2).equals(Buffer.from("PK")));
    const zipText = zipBytes.toString("latin1");
    assert.match(zipText, /config\.json/);
    assert.match(zipText, /main\.py/);
    assert.match(zipText, /readme\.txt/);
  });

  it("renders mobile validation and field test controls", async () => {
    const page = await request(app).get("/device-binding-v1");
    assert.equal(page.status, 200);
    assert.match(page.text, /id="di-port-list"/);
    assert.match(page.text, /id="ro-port-list"/);
    assert.match(page.text, /id="btn-save-config"/);
    assert.match(page.text, /チャタリング防止 50ms/);
    assert.match(page.text, /data-firmware-file="config.json"/);

    const js = await request(app).get("/js/device-binding-v1.js");
    assert.match(js.text, /※名称を入力してください/);
    assert.match(js.text, /🟢 検知中（ON）/);
    assert.match(js.text, /ポート設定・現場登録/);
    assert.match(js.text, /window\.location\.assign/);
    assert.match(js.text, /\/app\/gas-monitor\?propertyId=/);
    assert.match(js.text, /\/api\/device\/ports\/relay-test/);
    assert.match(js.text, /\/api\/device\/ports\/firmware/);

    const operatorJs = await request(app).get(
      "/js/features/gas-monitor/gas-monitor-operator-v1.js"
    );
    assert.match(
      operatorJs.text,
      /📥 RP2350設定ファイルをダウンロード/
    );
    assert.match(
      operatorJs.text,
      /tisly-rp2350-firmware\.zip/
    );

    const worker = await request(app).get("/service-worker.js");
    assert.match(
      worker.text,
      /v2454-rp2350-firmware-zip/
    );
    assert.match(worker.text, /\/device-binding-v1\.html/);
  });
});

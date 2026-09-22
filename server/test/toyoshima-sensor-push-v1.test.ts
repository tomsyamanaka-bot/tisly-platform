import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import fs from "fs";
import path from "path";

process.env.JWT_SECRET = "test-jwt-toyoshima-sensor-push-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-toyoshima-sensor-push-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  HOME_JP_TOYOSHIMA_SITE_ID_V1,
  SEC_JP_TOYOSHIMA_SITE_ID_V1,
  ingestToyoshimaHeartbeatInputsV1,
  processToyoshimaSecurityEventV1,
  releaseToyoshimaNotifyStopperForTestV1,
  resetToyoshimaSecurityStateForTestV1,
  resolveToyoshimaNotifyGateV1,
  toyoshimaSensorLabelV1,
} = await import("../src/home/home-toyoshima-security-v1.js");
const { getHomeSecurityRulesV1, updateHomeSecurityRulesV1 } = await import(
  "../src/home/home-security-rules-v1.js"
);
const { listSystemLogsV1 } = await import("../src/home/home-system-log-v1.js");
const {
  consumeToyoshimaDeviceCommandV1,
  resetToyoshimaDeviceCommandQueueForTestV1,
} = await import("../src/home/home-toyoshima-command-queue-v1.js");

const app = createApp();

function armAway(): void {
  updateHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
    customerSecurityMode: "away",
    guardMode: "always",
    scheduleStart: "00:00",
    scheduleEnd: "00:00",
    securityMode: "2STEP",
    notifyStagedMode: "critical",
    notifyMainFarMode: "critical",
    notifyMainNearMode: "critical",
    notifyDi1Mode: "critical",
    notifyDi2Mode: "critical",
  });
}

function latestLogs(category: string, limit = 20) {
  return listSystemLogsV1({
    siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
    category,
    limit,
  });
}

describe("toyoshima-sensor-push-v1", () => {
  afterEach(() => {
    resetToyoshimaSecurityStateForTestV1();
    resetToyoshimaDeviceCommandQueueForTestV1();
  });

  after(() => {
    closeDatabase();
    try {
      fs.unlinkSync(path.resolve("data/test-toyoshima-sensor-push-v1.db"));
    } catch {
      /* */
    }
  });

  it("sensor labels follow the dashboard wording", () => {
    assert.equal(toyoshimaSensorLabelV1("main", 1), "外周ビーム（母屋・遠）");
    assert.equal(
      toyoshimaSensorLabelV1("main", 2),
      "建物至近ビーム（母屋・近）"
    );
    assert.equal(
      toyoshimaSensorLabelV1("detached", 1),
      "道路側センサー（はなれ）"
    );
    assert.equal(
      toyoshimaSensorLabelV1("detached", 2),
      "通路側センサー（はなれ）"
    );
  });

  it("RP2350 event POST records history with the sensor name", async () => {
    armAway();
    /* 実機ファームが送る形そのまま */
    const res = await request(app)
      .post("/api/home/v1/toyoshima/event")
      .send({
        building: "main",
        di: 1,
        message: "⚠️ 外周で接近検知",
        tenantId: "TOYOSHIMA001",
        siteId: SEC_JP_TOYOSHIMA_SITE_ID_V1,
        deviceId: "rp2350-toyoshima-main-01",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.sensorLabel, "外周ビーム（母屋・遠）");

    const alerts = latestLogs("sensor_alert");
    const row = alerts.find((r) => r.message.includes("外周ビーム（母屋・遠）"));
    assert.ok(row, "sensor_alert に検知履歴が残る");
    assert.equal(row?.detail?.sensorId, "main_beam_far");
    assert.equal(row?.detail?.pushAllowed, true);
    assert.equal(row?.detail?.sensorName, "外周ビーム（母屋・遠）");
    assert.ok(row?.detail?.detectedAt);
    assert.ok(row?.detail?.detectedAtJst);
    assert.equal(row?.actor, "rp2350");
  });

  it("push dispatch is logged even when delivery fails", async () => {
    armAway();
    await processToyoshimaSecurityEventV1({ building: "main", di: 2 });
    const pushLogs = latestLogs("push_notify");
    const row = pushLogs.find((r) =>
      r.message.includes("建物至近ビーム（母屋・近）")
    );
    assert.ok(row, "push_notify に送信結果が残る");
    assert.equal(row?.detail?.sensorId, "main_beam_near");
  });

  it("relay queue is filled regardless of push outcome", async () => {
    armAway();
    const result = await processToyoshimaSecurityEventV1({
      building: "main",
      di: 2,
    });
    assert.equal(result.ok, true);
    /* VAPID 未設定のテスト環境では送信は失敗する。
     * それでも DO 側は止まらないことを確認する。
     */
    assert.equal(result.pushSent, false);
    const cmd = consumeToyoshimaDeviceCommandV1("main");
    assert.equal(cmd?.command, "sensor_near");
    assert.deepEqual(cmd?.channels, [1, 2, 3]);
  });

  it("disarmed detection still records history and logs the skip reason", async () => {
    updateHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
      customerSecurityMode: "disarmed",
      guardMode: "off",
    });
    const result = await processToyoshimaSecurityEventV1({
      building: "main",
      di: 1,
    });
    assert.equal(result.pushSent, false);

    const alerts = latestLogs("sensor_alert");
    assert.ok(
      alerts.some((r) => r.message.includes("外周ビーム（母屋・遠）")),
      "解除中でも検知履歴は残す"
    );
    const skip = latestLogs("push_notify").find((r) =>
      r.message.startsWith("Push見送り")
    );
    assert.ok(skip, "見送り理由を残す");
    assert.equal(skip?.detail?.skipReason, "警戒解除中");
  });

  it("away mode still pushes when leftover sensor mode is off", async () => {
    updateHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
      customerSecurityMode: "away",
      guardMode: "always",
      notifyMainFarMode: "off",
      notifyStagedMode: "off",
    });
    const gate = resolveToyoshimaNotifyGateV1({
      rules: getHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1),
      sensorMode: "off",
    });
    assert.equal(gate.notifyAllowed, true);
    assert.equal(gate.effectiveMode, "critical");
    assert.equal(gate.skipReason, null);

    await processToyoshimaSecurityEventV1({ building: "main", di: 1 });
    const row = latestLogs("sensor_alert").find((r) =>
      r.message.includes("外周ビーム（母屋・遠）")
    );
    assert.equal(row?.detail?.pushAllowed, true);
    assert.equal(row?.detail?.notifyMode, "critical");
  });

  it("away mode still pushes when guardMode drifted to off", async () => {
    updateHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
      customerSecurityMode: "away",
      guardMode: "off",
      notifyMainFarMode: "off",
    });
    const gate = resolveToyoshimaNotifyGateV1({
      rules: getHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1),
      sensorMode: "off",
    });
    assert.equal(gate.customerMode, "away");
    assert.equal(gate.notifyAllowed, true);
  });

  it("detached sensors carry their own label", async () => {
    armAway();
    const result = await processToyoshimaSecurityEventV1({
      building: "detached",
      di: 2,
    });
    assert.equal(result.sensorLabel, "通路側センサー（はなれ）");
    const alerts = latestLogs("sensor_alert");
    assert.ok(
      alerts.some((r) => r.message.includes("通路側センサー（はなれ）"))
    );
  });

  it("home mode still pushes 24h even when leftover sensor mode is off", async () => {
    updateHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1, {
      customerSecurityMode: "home",
      guardMode: "scheduled",
      notifyMainFarMode: "off",
      notifyDi1Mode: "off",
    });
    const gate = resolveToyoshimaNotifyGateV1({
      rules: getHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1),
      sensorMode: "off",
    });
    assert.equal(gate.notifyAllowed, true);
    assert.equal(gate.effectiveMode, "critical");
  });

  it("heartbeat DI rising edge records parking/garage history", async () => {
    armAway();
    await ingestToyoshimaHeartbeatInputsV1({
      building: "detached",
      inputStates: { "1": "off", "2": "off" },
    });
    const fired = await ingestToyoshimaHeartbeatInputsV1({
      building: "detached",
      inputStates: { "1": "on", "2": "off" },
    });
    assert.equal(fired, 1);
    const row = latestLogs("sensor_alert").find((r) =>
      r.message.includes("道路側センサー（はなれ）")
    );
    assert.ok(row, "heartbeat 立上りでも発報履歴を残す");
    assert.equal(row?.detail?.sensorName, "道路側センサー（はなれ）");
    assert.ok(row?.detail?.detectedAtJst);
  });

  it("direct /event is never blocked by notify cooldown", async () => {
    armAway();
    const first = await processToyoshimaSecurityEventV1({
      building: "main",
      di: 1,
      source: "event",
    });
    const second = await processToyoshimaSecurityEventV1({
      building: "main",
      di: 1,
      source: "event",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const alerts = latestLogs("sensor_alert").filter((r) =>
      r.message.includes("外周ビーム（母屋・遠）")
    );
    assert.ok(alerts.length >= 2, "連続 /event でも履歴が残る");
    assert.equal(alerts[0]?.detail?.pushAllowed, true);
    assert.equal(alerts[1]?.detail?.pushAllowed, true);
  });

  it("releases notify stopper so later detections can fire again", async () => {
    armAway();
    await ingestToyoshimaHeartbeatInputsV1({
      building: "detached",
      inputStates: { "1": "off", "2": "off" },
    });
    const first = await ingestToyoshimaHeartbeatInputsV1({
      building: "detached",
      inputStates: { "1": "on", "2": "off" },
    });
    assert.equal(first, 1);
    const stuck = await ingestToyoshimaHeartbeatInputsV1({
      building: "detached",
      inputStates: { "1": "on", "2": "off" },
    });
    assert.equal(stuck, 0, "同一ONはクールダウン中に再発火しない");
    releaseToyoshimaNotifyStopperForTestV1("detached", 1);
    const again = await ingestToyoshimaHeartbeatInputsV1({
      building: "detached",
      inputStates: { "1": "on", "2": "off" },
    });
    assert.equal(again, 1, "ストッパー解除後は再通知できる");
  });
});

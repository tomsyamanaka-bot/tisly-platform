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
  processToyoshimaSecurityEventV1,
  resetToyoshimaSecurityStateForTestV1,
  toyoshimaSensorLabelV1,
} = await import("../src/home/home-toyoshima-security-v1.js");
const { updateHomeSecurityRulesV1 } = await import(
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
});

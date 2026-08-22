import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.REMOTE_TEST_TOKEN = process.env.REMOTE_TEST_TOKEN || "test-remote-token-abc123";

import request from "supertest";
import { createApp } from "../src/app.js";
import {
  detectChStateChanges,
  detectInputStateChanges,
  resetRemoteTestState,
} from "../src/remote-test/remote-test-state.js";
import { setSecurityDemoStatePathForTests } from "../src/remote-test/security-demo-state.js";
import { resetSecurityDemoConfigCache } from "../src/remote-test/security-demo-config.js";

const TEST_TOKEN = "test-remote-token-abc123";
const TEST_STATE_FILE = path.join(os.tmpdir(), `tisly-security-demo-test-${process.pid}.json`);

describe("Remote Test PoC API", () => {
  before(() => {
    process.env.REMOTE_TEST_TOKEN = TEST_TOKEN;
    setSecurityDemoStatePathForTests(TEST_STATE_FILE);
    resetSecurityDemoConfigCache();
    resetRemoteTestState();
  });

  after(() => {
    resetRemoteTestState();
    try {
      if (fs.existsSync(TEST_STATE_FILE)) fs.unlinkSync(TEST_STATE_FILE);
    } catch {
      /* ignore */
    }
    setSecurityDemoStatePathForTests(null);
  });

  const app = createApp();

  async function armSystem() {
    await request(app).post("/api/remote-test/arm").set("X-Remote-Test-Token", TEST_TOKEN);
  }

  it("rejects requests without token", async () => {
    const res = await request(app).get("/api/remote-test/status");
    assert.equal(res.status, 403);
  });

  it("GET /status returns initial state", async () => {
    const res = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.ch1State, "off");
    assert.deepEqual(res.body.chStates, {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    });
    assert.equal(res.body.pendingCommand, null);
    assert.equal(res.body.lastCommand, null);
    assert.ok(res.body.lastAccessIp);
    assert.match(res.body.lastAccessIp, /127\.0\.0\.1/);
  });

  it("GET /device returns offline when no poll yet", async () => {
    const res = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.online, false);
    assert.equal(res.body.offline, true);
    assert.equal(res.body.lastSeen, null);
    assert.equal(res.body.firmwareVersion, null);
    assert.deepEqual(res.body.chStates, {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    });
  });

  it("POST /ch1/on queues command (does not update confirmedChStates)", async () => {
    const res = await request(app)
      .post("/api/remote-test/ch1/on")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "ch1_on");
    // 楽観更新しないので confirmed chStates はまだ off
    assert.equal(res.body.ch1State, "off");
    assert.equal(res.body.pendingCommand, "ch1_on");
    assert.equal(res.body.lastCommand, "ch1_on");
  });

  it("GET /command delivers and clears pending command", async () => {
    const res = await request(app)
      .get("/api/remote-test/command")
      .query({ token: TEST_TOKEN });
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "ch1_on");
    // confirmed chStates はまだ off（heartbeat 待ち）
    assert.equal(res.body.ch1State, "off");
    assert.equal(res.body.chStates["1"], "off");

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.pendingCommand, null);
  });

  it("POST /command queues security light manual commands", async () => {
    resetRemoteTestState();
    const res = await request(app)
      .post("/api/remote-test/command")
      .set("X-Remote-Test-Token", TEST_TOKEN)
      .send({ command: "light_100v_on" });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.command, "light_100v_on");
    assert.equal(res.body.pendingCommand, "light_100v_on");

    const poll = await request(app)
      .get("/api/remote-test/command")
      .query({ token: TEST_TOKEN });
    assert.equal(poll.body.command, "light_100v_on");
  });

  it("POST /command rejects unknown security light command", async () => {
    const res = await request(app)
      .post("/api/remote-test/command")
      .set("X-Remote-Test-Token", TEST_TOKEN)
      .send({ command: "light_unknown" });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it("POST /ch3/on queues ch3_on without updating confirmedChStates", async () => {
    resetRemoteTestState();
    const res = await request(app)
      .post("/api/remote-test/ch3/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "ch3_on");
    assert.equal(res.body.channel, 3);
    // confirmed chStates は heartbeat まで off のまま
    assert.equal(res.body.chStates["3"], "off");
    assert.equal(res.body.ch1State, "off");
    assert.equal(res.body.pendingCommand, "ch3_on");
  });

  it("POST /ch8/off queues command but chStates remains unchanged", async () => {
    await request(app)
      .post("/api/remote-test/ch8/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const res = await request(app)
      .post("/api/remote-test/ch8/off")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "ch8_off");
    // 楽観更新しない → confirmed は off のまま（heartbeat 待ち）
    assert.equal(res.body.chStates["8"], "off");
  });

  it("GET /device returns online after heartbeat", async () => {
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN, firmware: "1.1.0-poc-success" })
      .send({
        chStates: {
          "1": "off",
          "2": "off",
          "3": "off",
          "4": "off",
          "5": "off",
          "6": "off",
          "7": "off",
          "8": "off",
        },
      });

    const res = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.online, true);
    assert.equal(res.body.offline, false);
    assert.ok(res.body.lastSeen);
    assert.equal(res.body.firmwareVersion, "1.1.0-poc-success");
    assert.ok(res.body.chStates);
    assert.equal(typeof res.body.chStates["1"], "string");
  });

  it("POST /heartbeat overwrites stale chStates from RP2350", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/ch2/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    await request(app)
      .post("/api/remote-test/ch3/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    await request(app)
      .post("/api/remote-test/ch8/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);

    const before = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    // PWA 操作では confirmedChStates を更新しないので off のまま
    assert.equal(before.body.chStates["2"], "off");
    assert.equal(before.body.chStates["3"], "off");
    assert.equal(before.body.chStates["8"], "off");

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN, firmware: "1.2.0-ch8" })
      .send({
        chStates: {
          "1": "off",
          "2": "off",
          "3": "off",
          "4": "off",
          "5": "off",
          "6": "off",
          "7": "off",
          "8": "off",
        },
      });

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.deepEqual(status.body.chStates, {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    });

    const device = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.deepEqual(device.body.chStates, status.body.chStates);
    assert.equal(device.body.firmwareVersion, "1.2.0-ch8");
  });

  it("GET /command poll does not update device lastSeen", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN, firmware: "1.1.0-poc-success" })
      .send({ chStates: { "1": "off", "2": "off", "3": "off", "4": "off", "5": "off", "6": "off", "7": "off", "8": "off" } });

    const before = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const lastSeen = before.body.lastSeen as string;
    assert.ok(lastSeen);

    await new Promise((r) => setTimeout(r, 50));

    await request(app).get("/api/remote-test/command").query({ token: TEST_TOKEN });

    const after = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(after.body.lastSeen, lastSeen);
  });

  it("POST /ch1/off queues command (confirmedChStates unchanged)", async () => {
    const res = await request(app)
      .post("/api/remote-test/ch1/off")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ch1State, "off");
    assert.equal(res.body.pendingCommand, "ch1_off");
  });

  it("POST /notify returns web_push as primary channel", async () => {
    const res = await request(app)
      .post("/api/remote-test/notify")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200, `unexpected status: ${res.status} body=${JSON.stringify(res.body)}`);
    assert.ok(res.body.channels);
    assert.ok("web_push" in res.body.channels);
    assert.equal(res.body.message, "TiSLY 通知テスト成功");
    assert.equal(res.body.primaryChannel, null);
    assert.equal(res.body.channels.web_push.channel, "web_push");
    assert.ok(res.body.push);
    assert.equal(typeof res.body.push.vapidConfigured, "boolean");
    assert.equal(typeof res.body.push.subscriptionCount, "number");
    assert.ok(res.body.push.lastResult);
    assert.equal(res.body.push.lastResult.success, false);
  });

  it("GET /status includes push metadata", async () => {
    const res = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.ok(res.body.push);
    assert.equal(typeof res.body.push.vapidConfigured, "boolean");
    assert.equal(typeof res.body.push.subscriptionCount, "number");
    assert.equal(res.body.lastPushSuccessAt, null);
  });

  it("detectChStateChanges finds OFF→ON and ON→OFF only", () => {
    const prev = {
      "1": "off",
      "2": "on",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    } as const;
    const next = {
      "1": "on",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "on",
    };
    const changes = detectChStateChanges(prev, next);
    assert.equal(changes.length, 3);
    assert.deepEqual(changes.find((c) => c.channel === 1), { channel: 1, from: "off", to: "on" });
    assert.deepEqual(changes.find((c) => c.channel === 2), { channel: 2, from: "on", to: "off" });
    assert.deepEqual(changes.find((c) => c.channel === 8), { channel: 8, from: "off", to: "on" });
    assert.equal(detectChStateChanges(next, next).length, 0);
  });

  it("first heartbeat baselines chStates without notifications", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN, firmware: "1.2.0-ch8" })
      .send({
        chStates: {
          "1": "off",
          "2": "off",
          "3": "off",
          "4": "off",
          "5": "off",
          "6": "off",
          "7": "off",
          "8": "on",
        },
      });

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory.length, 0);
  });

  it("heartbeat CH8 OFF→ON sends notification history entry", async () => {
    resetRemoteTestState();
    const allOff = {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    };

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: allOff });

    const onRes = await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({
        chStates: { ...allOff, "8": "on" },
      });
    assert.equal(onRes.status, 200);
    assert.equal(onRes.body.chStateChanges?.length, 1);
    assert.equal(onRes.body.chStateChanges[0].channel, 8);
    assert.equal(onRes.body.chStateChanges[0].from, "off");
    assert.equal(onRes.body.chStateChanges[0].to, "on");

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory.length, 1);
    assert.equal(status.body.notificationHistory[0].channel, 8);
    assert.equal(status.body.notificationHistory[0].to, "on");
    assert.equal(status.body.notificationHistory[0].body, "CH8 ON");
    assert.match(status.body.notificationHistory[0].title, /TiSLY CH8 ON/);
  });

  it("repeated heartbeat with same chStates does not add notifications", async () => {
    resetRemoteTestState();
    const ch8On = {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "on",
    };

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { ...ch8On, "8": "off" } });
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: ch8On });
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: ch8On });

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory.length, 1);
  });

  it("heartbeat CH8 ON→OFF sends notification history entry", async () => {
    resetRemoteTestState();
    const allOff = {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    };

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: allOff });
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { ...allOff, "8": "on" } });

    const offRes = await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: allOff });
    assert.equal(offRes.body.chStateChanges?.length, 1);
    assert.equal(offRes.body.chStateChanges[0].to, "off");

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory.length, 2);
    assert.equal(status.body.notificationHistory[0].channel, 8);
    assert.equal(status.body.notificationHistory[0].to, "off");
    assert.equal(status.body.notificationHistory[0].body, "CH8 OFF");
    assert.equal(status.body.notificationHistory[1].to, "on");
  });

  it("optimistic web ON still triggers push when heartbeat confirms device", async () => {
    resetRemoteTestState();
    const allOff = {
      "1": "off",
      "2": "off",
      "3": "off",
      "4": "off",
      "5": "off",
      "6": "off",
      "7": "off",
      "8": "off",
    };

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: allOff });

    await request(app)
      .post("/api/remote-test/ch8/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);

    const before = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(before.body.notificationHistory.length, 0);
    // PWA 操作では confirmedChStates を更新しないので off のまま
    assert.equal(before.body.chStates["8"], "off");

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { ...allOff, "8": "on" } });

    const after = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(after.body.notificationHistory.length, 1);
    assert.equal(after.body.notificationHistory[0].body, "CH8 ON");
  });

  it("GET /remote-test serves HTML page", async () => {
    const res = await request(app).get("/remote-test");
    assert.equal(res.status, 200);
    assert.match(res.text, /TiSLY Lite Security Demo/);
    assert.match(res.text, /\/remote-test\/app\.js/);
    assert.match(res.text, /id="btn-save-token" disabled/);
    assert.match(res.text, /maxlength="128"/);
    assert.match(res.text, /Push 登録状態/);
    assert.match(res.text, /id="browser-mode-hint"/);
    assert.match(res.text, /id="ios-pwa-guide"/);
    assert.match(res.text, /Push 成功時刻/);
    assert.match(res.text, /CH8/);
    assert.match(res.text, /btn-ch-on/);
    assert.match(res.text, /通知履歴/);
    assert.match(res.text, /id="notify-history"/);
    assert.match(res.text, /システム状態/);
    assert.match(res.text, /id="btn-arm"/);
    assert.match(res.text, /侵入シミュレーション/);
    assert.match(res.text, /id="event-history"/);
  });

  it("GET /remote-test/app.js serves in-scope script", async () => {
    const res = await request(app).get("/remote-test/app.js");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] ?? "", /javascript/);
    assert.match(res.text, /syncSaveButton/);
    assert.match(res.text, /\/api\/push\/test/);
    assert.match(res.text, /REMOTE_TEST_SW_URL/);
  });

  it("GET /tisly-app redirects to home", async () => {
    const res = await request(app).get("/tisly-app");
    assert.equal(res.status, 302);
    assert.match(res.headers.location ?? "", /\/tisly-app\/home/);
  });

  it("GET /tisly-app/home serves TiSLY App shell", async () => {
    const res = await request(app).get("/tisly-app/home");
    assert.equal(res.status, 200);
    assert.match(res.text, /TiSLY App/);
    assert.match(res.text, /data-route="devices"/);
  });

  it("GET /tisly-app/devices serves same shell", async () => {
    const res = await request(app).get("/tisly-app/devices");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-route="events"/);
  });

  // ---- 通知ロジック修正テスト ----

  it("notification: 初回heartbeat ch8 off → 通知なし", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { "1":"off","2":"off","3":"off","4":"off","5":"off","6":"off","7":"off","8":"off" } });
    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory.length, 0, "初回heartbeatでは通知不要");
  });

  it("notification: PWAでch8_on command登録 → chStatesはまだoff", async () => {
    // 前のテストから引き続き（resetしない）
    await request(app)
      .post("/api/remote-test/ch8/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.pendingCommand, "ch8_on");
    assert.equal(status.body.chStates["8"], "off", "heartbeat前はoffのまま");
    assert.equal(status.body.notificationHistory.length, 0, "command登録だけでは通知しない");
  });

  it("notification: heartbeatでch8 on到着 → 通知 TiSLY CH8 ON", async () => {
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { "1":"off","2":"off","3":"off","4":"off","5":"off","6":"off","7":"off","8":"on" } });
    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.chStates["8"], "on");
    assert.equal(status.body.notificationHistory.length, 1);
    assert.equal(status.body.notificationHistory[0].channel, 8);
    assert.equal(status.body.notificationHistory[0].to, "on");
    assert.match(status.body.notificationHistory[0].title, /TiSLY CH8 ON/);
  });

  it("notification: PWAでch8_off command登録 → chStatesはまだon", async () => {
    await request(app)
      .post("/api/remote-test/ch8/off")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.pendingCommand, "ch8_off");
    assert.equal(status.body.chStates["8"], "on", "heartbeat前はonのまま");
    assert.equal(status.body.notificationHistory.length, 1, "command登録だけでは通知増えない");
  });

  it("notification: heartbeatでch8 off到着 → 通知 TiSLY CH8 OFF", async () => {
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { "1":"off","2":"off","3":"off","4":"off","5":"off","6":"off","7":"off","8":"off" } });
    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.chStates["8"], "off");
    assert.equal(status.body.notificationHistory.length, 2);
    assert.equal(status.body.notificationHistory[0].channel, 8);
    assert.equal(status.body.notificationHistory[0].to, "off");
    assert.match(status.body.notificationHistory[0].title, /TiSLY CH8 OFF/);
  });

  it("notification: PWAでch4_on command登録してheartbeatでch4 on → 通知 TiSLY CH4 ON", async () => {
    await request(app)
      .post("/api/remote-test/ch4/on")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const before = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(before.body.chStates["4"], "off", "heartbeat前はoffのまま");

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { "1":"off","2":"off","3":"off","4":"on","5":"off","6":"off","7":"off","8":"off" } });
    const after = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(after.body.chStates["4"], "on");
    assert.equal(after.body.notificationHistory[0].channel, 4);
    assert.equal(after.body.notificationHistory[0].to, "on");
    assert.match(after.body.notificationHistory[0].title, /TiSLY CH4 ON/);
  });

  it("GET /debug returns heartbeat and state snapshot", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .set("X-Remote-Test-Token", TEST_TOKEN)
      .send({
        firmware: "1.2.1-notify-fix",
        chStates: { "1": "off", "2": "off", "3": "off", "4": "off", "5": "off", "6": "off", "7": "off", "8": "off" },
      });

    const res = await request(app)
      .get("/api/remote-test/debug")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.heartbeatMethod, "POST");
    assert.ok(res.body.lastHeartbeatAt);
    assert.equal(typeof res.body.subscriptionCount, "number");
    assert.deepEqual(res.body.confirmedChStates["1"], "off");
    assert.ok(Array.isArray(res.body.notificationHistory));
    assert.ok(res.body.heartbeatBody);
    assert.equal(res.body.lastPushResult, null);
  });

  it("notification: CH1 ON/OFF via heartbeat triggers notifications", async () => {
    resetRemoteTestState();
    const allOff = { "1": "off", "2": "off", "3": "off", "4": "off", "5": "off", "6": "off", "7": "off", "8": "off" };

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: allOff });

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { ...allOff, "1": "on" } });

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: allOff });

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory.length, 2);
    assert.equal(status.body.notificationHistory[0].channel, 1);
    assert.equal(status.body.notificationHistory[0].to, "off");
    assert.equal(status.body.notificationHistory[1].channel, 1);
    assert.equal(status.body.notificationHistory[1].to, "on");
    assert.ok(status.body.notificationHistory[0].timestamp);
  });

  it("notification: 同じheartbeatが連続しても通知しない", async () => {
    resetRemoteTestState();
    const currentChStates = { "1":"off","2":"off","3":"off","4":"on","5":"off","6":"off","7":"off","8":"off" };
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: { "1":"off","2":"off","3":"off","4":"off","5":"off","6":"off","7":"off","8":"off" } });
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: currentChStates });
    const statusBefore = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const countBefore = statusBefore.body.notificationHistory.length;

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: currentChStates });
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send({ chStates: currentChStates });

    const statusAfter = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(statusAfter.body.notificationHistory.length, countBefore, "同一状態の連続heartbeatでは通知なし");
  });

  // ---- Phase 6: DI1〜DI8 inputStates ----

  const allInputOff = {
    "1": "off",
    "2": "off",
    "3": "off",
    "4": "off",
    "5": "off",
    "6": "off",
    "7": "off",
    "8": "off",
  };

  const allChOff = {
    "1": "off",
    "2": "off",
    "3": "off",
    "4": "off",
    "5": "off",
    "6": "off",
    "7": "off",
    "8": "off",
  };

  function heartbeatPayload(inputOverrides: Record<string, string> = {}, chOverrides: Record<string, string> = {}) {
    return {
      chStates: { ...allChOff, ...chOverrides },
      inputStates: { ...allInputOff, ...inputOverrides },
    };
  }

  it("GET /status returns initial inputStates all off", async () => {
    resetRemoteTestState();
    const res = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.deepEqual(res.body.inputStates, allInputOff);
  });

  it("detectInputStateChanges finds OFF→ON and ON→OFF only", () => {
    const prev = { ...allInputOff, "1": "off", "4": "on", "8": "off" };
    const next = { ...allInputOff, "1": "on", "4": "off", "8": "on" };
    const changes = detectInputStateChanges(prev, next);
    assert.equal(changes.length, 3);
    assert.deepEqual(changes.find((c) => c.input === 1), { input: 1, from: "off", to: "on" });
    assert.deepEqual(changes.find((c) => c.input === 4), { input: 4, from: "on", to: "off" });
    assert.deepEqual(changes.find((c) => c.input === 8), { input: 8, from: "off", to: "on" });
  });

  it("first heartbeat baselines inputStates without notifications", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "1": "on" }));

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.inputStates["1"], "on");
    assert.equal(status.body.notificationHistory.length, 0);
  });

  it("heartbeat DI1 OFF→ON sends notification when armed", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    await armSystem();

    const onRes = await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "1": "on" }));
    assert.equal(onRes.body.inputStateChanges?.length, 1);
    assert.equal(onRes.body.inputStateChanges[0].input, 1);
    assert.equal(onRes.body.inputStateChanges[0].to, "on");

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory[0].kind, "security");
    assert.equal(status.body.notificationHistory[0].body, "玄関ビーム");
    assert.equal(status.body.notificationHistory[0].title, "侵入検知");
    assert.ok(status.body.eventHistory.length >= 1);
    assert.equal(status.body.eventHistory[0].type, "intrusion");
    assert.equal(status.body.eventHistory[0].input, "DI1");
    assert.equal(status.body.eventHistory[0].state, "ON");
  });

  it("heartbeat DI1 ON→OFF sends notification when armed", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    await armSystem();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "1": "on" }));

    const offRes = await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    assert.equal(offRes.body.inputStateChanges?.length, 1);
    assert.equal(offRes.body.inputStateChanges[0].to, "off");

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.notificationHistory[0].body, "玄関ビーム");
    assert.equal(status.body.notificationHistory[0].kind, "security");
    assert.equal(status.body.notificationHistory[0].title, "侵入検知（復帰）");
  });

  it("heartbeat DI4 ON/OFF sends notifications when armed", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    await armSystem();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "4": "on" }));
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const di4 = status.body.notificationHistory.filter(
      (h: { kind?: string; channel: number }) => h.kind === "security" && h.channel === 4
    );
    assert.equal(di4.length, 2);
    assert.equal(di4[0].body, "非常ボタン");
    assert.equal(di4[1].body, "非常ボタン");
    assert.equal(di4[1].title, "非常ボタン押下");
  });

  it("heartbeat DI8 ON/OFF sends notifications when armed", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    await armSystem();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "8": "on" }));
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const di8 = status.body.notificationHistory.filter(
      (h: { kind?: string; channel: number }) => h.kind === "security" && h.channel === 8
    );
    assert.equal(di8.length, 2);
    assert.equal(di8[0].body, "予備入力8");
    assert.equal(di8[1].body, "予備入力8");
  });

  it("GET /device returns inputStates after heartbeat", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "3": "on" }));

    const device = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.deepEqual(device.body.inputStates, { ...allInputOff, "3": "on" });
  });

  it("GET /remote-test serves DI input status section", async () => {
    const res = await request(app).get("/remote-test");
    assert.match(res.text, /デジタル入力状態/);
    assert.match(res.text, /id="st-di1"/);
    assert.match(res.text, /id="st-di8"/);
  });

  it("CH and DI notifications coexist in notificationHistory when armed", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    await armSystem();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "1": "on" }, { "8": "on" }));

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const sensorKinds = status.body.notificationHistory
      .filter((h: { kind: string }) => h.kind === "ch" || h.kind === "security")
      .map((h: { kind: string }) => h.kind)
      .sort();
    assert.deepEqual(sensorKinds, ["ch", "security"]);
  });

  // ---- Security Demo Mode ----

  it("GET /status returns DISARM by default with eventHistory", async () => {
    resetRemoteTestState();
    const res = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.body.securityMode, "DISARM");
    assert.equal(res.body.armed, false);
    assert.ok(Array.isArray(res.body.eventHistory));
    assert.ok(res.body.securityDemoConfig?.inputs["1"]);
  });

  it("POST /arm sets ARM and records notificationHistory", async () => {
    resetRemoteTestState();
    const res = await request(app)
      .post("/api/remote-test/arm")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.securityMode, "ARM");
    assert.equal(res.body.changed, true);
    assert.equal(res.body.notificationHistory[0].kind, "arm");
    assert.equal(res.body.notificationHistory[0].title, "警戒ON");
    assert.equal(res.body.eventHistory[0].type, "arm");
    assert.equal(res.body.eventHistory[0].state, "ARM");
  });

  it("POST /disarm sets DISARM and records notificationHistory", async () => {
    resetRemoteTestState();
    await armSystem();
    const res = await request(app)
      .post("/api/remote-test/disarm")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.body.securityMode, "DISARM");
    assert.equal(res.body.notificationHistory[0].kind, "disarm");
    assert.equal(res.body.notificationHistory[0].title, "警戒OFF");
  });

  it("armed: DI1 ON generates event, push history, and notification", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());
    await armSystem();

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "1": "on" }));

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    const intrusionEvents = status.body.eventHistory.filter(
      (e: { type: string; input: string }) => e.type === "intrusion" && e.input === "DI1"
    );
    assert.equal(intrusionEvents.length, 1);
    assert.equal(intrusionEvents[0].state, "ON");
    const securityNotify = status.body.notificationHistory.find(
      (h: { kind: string; channel: number }) => h.kind === "security" && h.channel === 1
    );
    assert.ok(securityNotify);
    assert.equal(securityNotify.title, "侵入検知");
  });

  it("disarmed: DI1 ON records eventHistory only without push notification", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());

    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload({ "1": "on" }));

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.securityMode, "DISARM");
    const inputEvents = status.body.eventHistory.filter(
      (e: { input: string }) => e.input === "DI1"
    );
    assert.equal(inputEvents.length, 1);
    assert.equal(inputEvents[0].type, "input");
    assert.equal(inputEvents[0].state, "ON");
    const securityNotify = status.body.notificationHistory.find(
      (h: { kind: string }) => h.kind === "security"
    );
    assert.equal(securityNotify, undefined);
  });

  it("POST /demo/intrusion-simulation triggers DI1 ON when armed", async () => {
    resetRemoteTestState();
    await armSystem();
    const res = await request(app)
      .post("/api/remote-test/demo/intrusion-simulation")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.simulated.input, 1);
    assert.equal(res.body.simulated.to, "on");
    assert.equal(res.body.inputStates["1"], "on");
    const intrusion = res.body.eventHistory.find(
      (e: { type: string; input: string }) => e.type === "intrusion" && e.input === "DI1"
    );
    assert.ok(intrusion);
    assert.equal(res.body.notificationHistory[0].kind, "security");
  });

  it("security mode persists across state reload", async () => {
    resetRemoteTestState();
    await request(app).post("/api/remote-test/arm").set("X-Remote-Test-Token", TEST_TOKEN);
    assert.ok(fs.existsSync(TEST_STATE_FILE));
    const raw = JSON.parse(fs.readFileSync(TEST_STATE_FILE, "utf-8"));
    assert.equal(raw.securityMode, "ARM");
  });

  it("eventHistory keeps at most 100 entries", async () => {
    resetRemoteTestState();
    await request(app)
      .post("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN })
      .send(heartbeatPayload());

    for (let i = 0; i < 105; i++) {
      await request(app)
        .post("/api/remote-test/heartbeat")
        .query({ token: TEST_TOKEN })
        .send(heartbeatPayload({ "1": i % 2 === 0 ? "on" : "off" }));
    }

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.ok(status.body.eventHistory.length <= 100);
  });
});

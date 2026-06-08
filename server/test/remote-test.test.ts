import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.REMOTE_TEST_TOKEN = process.env.REMOTE_TEST_TOKEN || "test-remote-token-abc123";

import request from "supertest";
import { createApp } from "../src/app.js";
import { resetRemoteTestState } from "../src/remote-test/remote-test-state.js";

const TEST_TOKEN = "test-remote-token-abc123";

describe("Remote Test PoC API", () => {
  before(() => {
    process.env.REMOTE_TEST_TOKEN = TEST_TOKEN;
    resetRemoteTestState();
  });

  after(() => {
    resetRemoteTestState();
  });

  const app = createApp();

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
  });

  it("POST /ch1/on queues command", async () => {
    const res = await request(app)
      .post("/api/remote-test/ch1/on")
      .set("Authorization", `Bearer ${TEST_TOKEN}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "ch1_on");
    assert.equal(res.body.ch1State, "on");
    assert.equal(res.body.pendingCommand, "ch1_on");
    assert.equal(res.body.lastCommand, "ch1_on");
  });

  it("GET /command delivers and clears pending command", async () => {
    const res = await request(app)
      .get("/api/remote-test/command")
      .query({ token: TEST_TOKEN });
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "ch1_on");
    assert.equal(res.body.ch1State, "on");

    const status = await request(app)
      .get("/api/remote-test/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(status.body.pendingCommand, null);
  });

  it("GET /device returns online after heartbeat", async () => {
    await request(app)
      .get("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN, firmware: "1.1.0-poc-success" });

    const res = await request(app)
      .get("/api/remote-test/device")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.online, true);
    assert.equal(res.body.offline, false);
    assert.ok(res.body.lastSeen);
    assert.equal(res.body.firmwareVersion, "1.1.0-poc-success");
  });

  it("GET /command poll does not update device lastSeen", async () => {
    resetRemoteTestState();
    await request(app)
      .get("/api/remote-test/heartbeat")
      .query({ token: TEST_TOKEN, firmware: "1.1.0-poc-success" });

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

  it("POST /ch1/off updates state", async () => {
    const res = await request(app)
      .post("/api/remote-test/ch1/off")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ch1State, "off");
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

  it("GET /remote-test serves HTML page", async () => {
    const res = await request(app).get("/remote-test");
    assert.equal(res.status, 200);
    assert.match(res.text, /TiSLY Remote Test/);
    assert.match(res.text, /\/remote-test\/app\.js/);
    assert.match(res.text, /id="btn-save-token" disabled/);
    assert.match(res.text, /maxlength="128"/);
    assert.match(res.text, /Push 登録状態/);
    assert.match(res.text, /id="ios-pwa-guide"/);
    assert.match(res.text, /Push 成功時刻/);
  });

  it("GET /remote-test/app.js serves in-scope script", async () => {
    const res = await request(app).get("/remote-test/app.js");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] ?? "", /javascript/);
    assert.match(res.text, /syncSaveButton/);
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
});

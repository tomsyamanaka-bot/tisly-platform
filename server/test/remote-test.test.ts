import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
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

  it("POST /ch1/off updates state", async () => {
    const res = await request(app)
      .post("/api/remote-test/ch1/off")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ch1State, "off");
  });

  it("POST /notify returns channel results", async () => {
    const res = await request(app)
      .post("/api/remote-test/notify")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.ok(res.body.channels);
    assert.equal(res.body.message, "TiSLY 通知テスト成功");
  });

  it("GET /remote-test serves HTML page", async () => {
    const res = await request(app).get("/remote-test");
    assert.equal(res.status, 200);
    assert.match(res.text, /TiSLY Remote Test/);
  });
});

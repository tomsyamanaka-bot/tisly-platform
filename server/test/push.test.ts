import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.REMOTE_TEST_TOKEN = process.env.REMOTE_TEST_TOKEN || "test-push-token-xyz789";

import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";
import { resetRemoteTestState } from "../src/remote-test/remote-test-state.js";

const TEST_TOKEN = "test-push-token-xyz789";
const TEST_VAPID_PUBLIC =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const TEST_VAPID_PRIVATE = "Uxi0kNLdX6vhpRHdHsx3TKq72z91YV9RAFpF551P2SM";
const TEST_SUBSCRIPTION = {
  endpoint: "https://push.example.com/sub/push-test-1",
  keys: {
    p256dh: "BOrri7HQZ2bM0B4aWj8vN0xKpQ2mR8sT1uV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

describe("Push API (/api/push)", () => {
  const savedPublic = process.env.VAPID_PUBLIC_KEY;
  const savedPrivate = process.env.VAPID_PRIVATE_KEY;
  const savedRemoteToken = process.env.REMOTE_TEST_TOKEN;

  before(() => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.REMOTE_TEST_TOKEN = TEST_TOKEN;
    resetRemoteTestState();
  });

  after(() => {
    if (savedPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = savedPublic;
    if (savedPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = savedPrivate;
    if (savedRemoteToken === undefined) delete process.env.REMOTE_TEST_TOKEN;
    else process.env.REMOTE_TEST_TOKEN = savedRemoteToken;
    resetRemoteTestState();
  });

  const app = createApp();

  it("GET /vapid-public-key returns 503 when VAPID is not configured", async () => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    const res = await request(app).get("/api/push/vapid-public-key");
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "VAPID keys not configured");
    assert.equal(res.body.configured, false);
    assert.match(res.body.hint, /vapid:setup/);
  });

  it("GET /status rejects requests without token", async () => {
    const res = await request(app).get("/api/push/status");
    assert.equal(res.status, 403);
  });

  it("POST /subscribe rejects requests without token", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: TEST_SUBSCRIPTION });
    assert.equal(res.status, 403);
  });

  it("POST /test rejects requests without token", async () => {
    const res = await request(app).post("/api/push/test");
    assert.equal(res.status, 403);
  });

  it("POST /subscribe rejects invalid token with 403", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("X-Remote-Test-Token", "wrong-token")
      .send({ subscription: TEST_SUBSCRIPTION });
    assert.equal(res.status, 403);
  });
});

describe("Push API with VAPID configured", () => {
  const savedPublic = process.env.VAPID_PUBLIC_KEY;
  const savedPrivate = process.env.VAPID_PRIVATE_KEY;
  const savedRemoteToken = process.env.REMOTE_TEST_TOKEN;

  before(() => {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID_PRIVATE;
    process.env.REMOTE_TEST_TOKEN = TEST_TOKEN;
    resetRemoteTestState();
  });

  after(() => {
    if (savedPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = savedPublic;
    if (savedPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = savedPrivate;
    if (savedRemoteToken === undefined) delete process.env.REMOTE_TEST_TOKEN;
    else process.env.REMOTE_TEST_TOKEN = savedRemoteToken;
    resetRemoteTestState();
  });

  const app = createApp();

  it("GET /vapid-public-key returns public key", async () => {
    const res = await request(app).get("/api/push/vapid-public-key");
    assert.equal(res.status, 200);
    assert.equal(res.body.publicKey, TEST_VAPID_PUBLIC);
    assert.equal(res.body.configured, true);
  });

  it("GET /status returns push metadata with token", async () => {
    const res = await request(app)
      .get("/api/push/status")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.vapidConfigured, true);
    assert.equal(res.body.userId, "remote-test");
    assert.equal(typeof res.body.subscriptionCount, "number");
  });

  it("POST /subscribe saves subscription for remote-test user", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${TEST_TOKEN}`)
      .send({ subscription: TEST_SUBSCRIPTION });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.tokenId);
    assert.equal(res.body.userId, "remote-test");
    assert.ok(res.body.subscriptionCount >= 1);

    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT user_id FROM notification_tokens WHERE channel = 'web_push' AND endpoint = ?`
      )
      .get(TEST_SUBSCRIPTION.endpoint) as { user_id: string };
    assert.equal(row.user_id, "remote-test");
  });

  it("POST /test returns configured title and body", async () => {
    const res = await request(app)
      .post("/api/push/test")
      .set("X-Remote-Test-Token", TEST_TOKEN);
    assert.equal(res.status, 200);
    assert.equal(res.body.title, "TiSLY 通知テスト");
    assert.equal(res.body.body, "Push通知が正常に届きました");
    assert.ok(res.body.channels?.web_push);
    assert.equal(res.body.channels.web_push.channel, "web_push");
    assert.equal(typeof res.body.channels.web_push.success, "boolean");
    assert.ok(res.body.push);
    assert.equal(res.body.push.vapidConfigured, true);
    assert.ok(res.body.push.subscriptionCount >= 1);
  });

  it("GET /remote-test/service-worker.js is served with scope header", async () => {
    const res = await request(app).get("/remote-test/service-worker.js");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] ?? "", /javascript/);
    assert.equal(res.headers["service-worker-allowed"], "/remote-test/");
    assert.match(res.text, /notificationclick/);
    assert.match(res.text, /addEventListener\("push"/);
  });
});

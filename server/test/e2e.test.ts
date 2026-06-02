import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getDatabase } from "../src/db/database.js";

const app = createApp();

before(() => {
  getDatabase();
});

describe("TiSLY E2E API (Phase 121-140)", () => {
  it("GET /health returns phase 121-140", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.phase, "121-140");
  });

  it("POST /api/devices/register", async () => {
    const res = await request(app)
      .post("/api/devices/register")
      .send({
        deviceId: "E2E-TEST-DEVICE",
        deviceType: "gateway",
        platform: "test",
        siteId: "e2e-site",
      });
    assert.ok(res.status === 201 || res.status === 200);
    assert.equal(res.body.deviceId, "E2E-TEST-DEVICE");
  });

  it("POST /api/test/event", async () => {
    const res = await request(app)
      .post("/api/test/event")
      .send({ message: "e2e test event" });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it("POST /api/test/alarm", async () => {
    const res = await request(app).post("/api/test/alarm").send({});
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it("POST /api/tv/pairing/start and confirm", async () => {
    const start = await request(app)
      .post("/api/tv/pairing/start")
      .send({ tvDeviceId: "E2E-TV-001" });
    assert.equal(start.status, 201);
    assert.match(start.body.pairingCode, /^\d{6}$/);

    const confirm = await request(app)
      .post("/api/tv/pairing/confirm")
      .send({
        pairingCode: start.body.pairingCode,
        siteId: "e2e-site",
        tvDeviceId: "E2E-TV-001",
      });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.ok, true);
    assert.equal(confirm.body.tv.siteId, "e2e-site");
  });

  it("GET /api/qnap/status", async () => {
    const res = await request(app).get("/api/qnap/status");
    assert.equal(res.status, 200);
    assert.ok(res.body);
  });
});

after(() => {
  /* keep db for local dev */
});

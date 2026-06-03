import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-floor-map-phase481";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-floor-map-phase481.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function adminLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.admin", password: "demo-remote-2026" });
}

describe("Phase 481-500 PRO Remote floor map", () => {
  let token = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await adminLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  after(() => closeDatabase());

  it("returns perimeter 1f 2f floor stack", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/pro-remote/floor-stack")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const tiers = res.body.layers.map((l: { tier: string }) => l.tier);
    assert.ok(tiers.includes("perimeter"));
    assert.ok(tiers.includes("1f"));
    assert.ok(tiers.includes("2f"));
    assert.ok(Array.isArray(res.body.pinTypes));
  });

  it("places pin and alert jump endpoint", async () => {
    const stack = await request(app)
      .get("/api/customer/TOMS001/pro-remote/floor-stack")
      .set("Authorization", `Bearer ${token}`);
    const layerId = stack.body.layers[0].layerId;
    const pin = await request(app)
      .post("/api/customer/TOMS001/pro-remote/floor-stack/pins")
      .set("Authorization", `Bearer ${token}`)
      .send({ layerId, pinType: "camera", posX: 50, posY: 50, label: "入口" });
    assert.equal(pin.status, 201);
    assert.equal(pin.body.pinType, "camera");
    const alert = await request(app)
      .get("/api/customer/TOMS001/pro-remote/floor-stack/alert-jump")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(alert.status, 200);
    assert.ok("tier" in alert.body);
  });

  it("serves pro-remote page with floor map assets", async () => {
    const res = await request(app).get("/customer/TOMS001/pro-remote");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("floor-map-stack"));
    assert.ok(res.text.includes("pro-remote-floor-map.css"));
  });
});

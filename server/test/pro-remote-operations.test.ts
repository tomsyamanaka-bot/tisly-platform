import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-pro-remote-phase281";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pro-remote-ops.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
}

async function adminLogin() {
  return request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: process.env.ADMIN_PASSWORD ?? "admin" });
}

describe("Phase 281-300 PRO Remote operations", () => {
  let tomsAdmin = "";
  let hotelAdmin = "";
  let plantAdmin = "";
  let platformAdmin = "";

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
    const ta = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(ta.status, 200, ta.body?.error);
    tomsAdmin = ta.body.token;

    const ha = await customerLogin("HOTEL001", "hotel001.admin");
    assert.equal(ha.status, 200, ha.body?.error);
    hotelAdmin = ha.body.token;

    const pa = await customerLogin("PLANT001", "plant001.admin");
    assert.equal(pa.status, 200, pa.body?.error);
    plantAdmin = pa.body.token;

    const ad = await adminLogin();
    if (ad.status === 200) platformAdmin = ad.body.token;
  });

  after(() => {
    closeDatabase();
  });

  it("cross-customer incidents are not visible", async () => {
    if (!platformAdmin) return;
    const scoped = await request(app)
      .get("/api/incidents?customerCode=TOMS001")
      .set("Authorization", `Bearer ${platformAdmin}`);
    assert.equal(scoped.status, 200);
    for (const inc of scoped.body.incidents ?? []) {
      if (inc.customer_id) {
        const cust = getDatabase()
          .prepare(`SELECT customer_code FROM customers WHERE customer_id = ?`)
          .get(inc.customer_id) as { customer_code: string } | undefined;
        assert.ok(!cust || cust.customer_code === "TOMS001");
      }
    }
  });

  it("PRO_REMOTE allows webhook, Lite blocks via plan on rules", async () => {
    const wh = await request(app)
      .post("/api/customer/TOMS001/webhooks")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ url: "https://example.com/toms-281" });
    assert.equal(wh.status, 201);

    const liteRule = await request(app)
      .post("/api/customer/PLANT001/notification-rules")
      .set("Authorization", `Bearer ${plantAdmin}`)
      .send({ name: "webhook-try", channels: ["webhook"] });
    assert.equal(liteRule.status, 403);
  });

  it("Standard plan rejects webhook create", async () => {
    const res = await request(app)
      .post("/api/customer/PLANT001/webhooks")
      .set("Authorization", `Bearer ${plantAdmin}`)
      .send({ url: "https://example.com/plant" });
    assert.equal(res.status, 403);
    assert.equal(res.body.channel, "webhook");
  });

  it("report export includes export_id", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/reports/export")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ reportType: "weekly" });
    assert.equal(res.status, 201);
    assert.ok(res.body.export_id ?? res.body.export?.export_id);
  });

  it("disabled user cannot login", async () => {
    const invite = await request(app)
      .post("/api/customer/TOMS001/users/invite")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ username: "toms001.disabled.281", role: "viewer" });
    assert.equal(invite.status, 201);
    await request(app)
      .post("/api/customer/TOMS001/users/accept-invite")
      .send({ inviteToken: invite.body.inviteToken, password: "disabled-281-2026" });
    const row = getDatabase()
      .prepare(
        `SELECT id FROM customer_users WHERE username = 'toms001.disabled.281'`
      )
      .get() as { id: string };
    await request(app)
      .post(`/api/customer/TOMS001/users/${row.id}/disable`)
      .set("Authorization", `Bearer ${tomsAdmin}`);
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.disabled.281",
        password: "disabled-281-2026",
      });
    assert.notEqual(login.status, 200);
  });

  it("customer scope filter on events API", async () => {
    if (!platformAdmin) return;
    const res = await request(app)
      .get("/api/events?limit=5&customerCode=HOTEL001")
      .set("Authorization", `Bearer ${platformAdmin}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
  });

  it("notification rule plan guard allows email on Standard", async () => {
    const res = await request(app)
      .post("/api/customer/PLANT001/notification-rules")
      .set("Authorization", `Bearer ${plantAdmin}`)
      .send({ name: "email-only", channels: ["email"] });
    assert.equal(res.status, 201);
  });

  it("HOTEL001 customer cannot see TOMS001 users", async () => {
    const res = await request(app)
      .get("/api/customer/HOTEL001/users")
      .set("Authorization", `Bearer ${hotelAdmin}`);
    assert.equal(res.status, 200);
    const names = (res.body.users as Array<{ username: string }>).map((u) => u.username);
    assert.ok(!names.some((n) => n.startsWith("toms001.")));
  });
});

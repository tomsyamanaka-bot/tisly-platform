import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-invite-phase261";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-invite-isolated.db";
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

describe("Phase 261-280 customer invite & reports", () => {
  let tomsAdmin = "";
  let tomsViewer = "";
  let plantAdmin = "";

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

    const tv = await customerLogin("TOMS001", "toms001.viewer");
    assert.equal(tv.status, 200, tv.body?.error);
    tomsViewer = tv.body.token;

    const pa = await customerLogin("PLANT001", "plant001.admin");
    assert.equal(pa.status, 200, pa.body?.error);
    plantAdmin = pa.body.token;
  });

  after(() => {
    closeDatabase();
  });

  it("owner/admin can invite users", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/users/invite")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ username: "toms001.invited.test", role: "viewer" });
    assert.equal(res.status, 201);
    assert.ok(res.body.inviteToken);
  });

  it("viewer cannot invite users", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/users/invite")
      .set("Authorization", `Bearer ${tomsViewer}`)
      .send({ username: "toms001.bad.invite", role: "viewer" });
    assert.equal(res.status, 403);
  });

  it("expired invite is rejected", async () => {
    const invite = await request(app)
      .post("/api/customer/TOMS001/users/invite")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ username: "toms001.expired.test", role: "viewer" });
    assert.equal(invite.status, 201);
    const token = invite.body.inviteToken as string;
    getDatabase()
      .prepare(
        `UPDATE customer_users SET invite_expires_at = datetime('now', '-1 hour') WHERE invite_token = ?`
      )
      .run(token);
    const accept = await request(app)
      .post("/api/customer/TOMS001/users/accept-invite")
      .send({ inviteToken: token, password: "newpass-demo-2026" });
    assert.equal(accept.status, 400);
    assert.match(String(accept.body.error), /expired/i);
  });

  it("disabled user cannot login", async () => {
    const invite = await request(app)
      .post("/api/customer/TOMS001/users/invite")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ username: "toms001.disable.test", role: "viewer" });
    const token = invite.body.inviteToken as string;
    await request(app)
      .post("/api/customer/TOMS001/users/accept-invite")
      .send({ inviteToken: token, password: "disable-test-2026" });

    const row = getDatabase()
      .prepare(
        `SELECT id FROM customer_users WHERE username = ? AND customer_id = (SELECT customer_id FROM customers WHERE customer_code = 'TOMS001')`
      )
      .get("toms001.disable.test") as { id: string };

    await request(app)
      .post(`/api/customer/TOMS001/users/${row.id}/disable`)
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({});

    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.disable.test",
        password: "disable-test-2026",
      });
    assert.notEqual(login.status, 200);
  });

  it("users from another customer are not visible", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/users")
      .set("Authorization", `Bearer ${tomsViewer}`);
    assert.equal(res.status, 200);
    const names = (res.body.users as Array<{ username: string }>).map((u) => u.username);
    assert.ok(!names.some((n) => n.startsWith("hotel001.")));
  });

  it("report export includes export_id", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/reports/export")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ reportType: "monthly" });
    assert.equal(res.status, 201);
    assert.ok(res.body.export?.export_id);
  });

  it("PLANT001 Standard plan blocks webhook", async () => {
    const res = await request(app)
      .post("/api/customer/PLANT001/webhooks")
      .set("Authorization", `Bearer ${plantAdmin}`)
      .send({ url: "https://example.com/hook" });
    assert.equal(res.status, 403);
    assert.equal(res.body.channel, "webhook");
  });

  it("TOMS001 PRO_REMOTE allows webhook create", async () => {
    const res = await request(app)
      .post("/api/customer/TOMS001/webhooks")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ url: "https://example.com/toms-hook" });
    assert.equal(res.status, 201);
    assert.ok(res.body.webhook?.id);
  });
});

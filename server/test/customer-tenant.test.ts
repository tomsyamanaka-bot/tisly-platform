import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { getDatabase } from "../src/db/database.js";

process.env.JWT_SECRET = "test-jwt-tenant-phase241";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.CUSTOMER_LOGIN_MAX_ATTEMPTS = "3";
process.env.CUSTOMER_LOGIN_LOCK_MINUTES = "1";
process.env.NODE_ENV = "test";

const app = createApp();

async function customerLogin(code: string, username: string) {
  const res = await request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
  return res;
}

describe("Phase 241-260 tenant isolation", () => {
  let tomsViewer = "";
  let tomsAdmin = "";
  let hotelViewer = "";

  before(async () => {
    getDatabase();
    const tv = await customerLogin("TOMS001", "toms001.viewer");
    assert.equal(tv.status, 200, tv.body?.error);
    tomsViewer = tv.body.token;

    const ta = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(ta.status, 200, ta.body?.error);
    tomsAdmin = ta.body.token;

    const hv = await customerLogin("HOTEL001", "hotel001.viewer");
    assert.equal(hv.status, 200, hv.body?.error);
    hotelViewer = hv.body.token;
  });

  it("TOMS001 user cannot read HOTEL001 dashboard", async () => {
    const res = await request(app)
      .get("/api/customer/HOTEL001/dashboard")
      .set("Authorization", `Bearer ${tomsViewer}`);
    assert.equal(res.status, 403);
  });

  it("unknown customer code returns 404", async () => {
    const res = await request(app)
      .get("/api/customer/NOBODY999/dashboard")
      .set("Authorization", `Bearer ${tomsViewer}`);
    assert.equal(res.status, 404);
  });

  it("viewer cannot PATCH customer settings", async () => {
    const res = await request(app)
      .patch("/api/customers/TOMS001")
      .set("Authorization", `Bearer ${tomsViewer}`)
      .send({ plan: "Lite" });
    assert.equal(res.status, 403);
  });

  it("admin can PATCH customer settings", async () => {
    const res = await request(app)
      .patch("/api/customers/TOMS001")
      .set("Authorization", `Bearer ${tomsAdmin}`)
      .send({ plan: "PRO_REMOTE" });
    assert.equal(res.status, 200);
    assert.equal(res.body.customer.plan, "PRO_REMOTE");
  });

  it("PLANT001 Standard plan blocks customer portal dashboard", async () => {
    const login = await customerLogin("PLANT001", "plant001.viewer");
    assert.equal(login.status, 200);
    const res = await request(app)
      .get("/api/customer/PLANT001/dashboard")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Plan restriction/);
  });

  it("TOMS001 PRO_REMOTE can access sales-report", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/sales-report")
      .set("Authorization", `Bearer ${tomsViewer}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.monthlyEvents >= 0);
    assert.ok(res.body.aiComment);
  });

  it("customer login lockout after failed attempts", async () => {
    const user = "toms001.manager";
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/auth/customer/login")
        .send({ customerCode: "TOMS001", username: user, password: "wrong-password" });
    }
    const locked = await request(app)
      .post("/api/auth/customer/login")
      .send({ customerCode: "TOMS001", username: user, password: "demo-remote-2026" });
    assert.equal(locked.status, 423);
  });
});

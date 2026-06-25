import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-jwt-secret-phase221";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";

const app = createApp();

describe("Phase 221-240 PRO Remote", () => {
  let adminToken = "";
  let customerToken = "";

  before(async () => {
    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "testpass" });
    assert.equal(adminRes.status, 200);
    adminToken = adminRes.body.token;

    const custRes = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.viewer",
        password: "demo-remote-2026",
      });
    assert.equal(custRes.status, 200, custRes.body?.error ?? "login failed");
    customerToken = custRes.body.token;
  });

  it("GET /api/health/full includes infrastructure and endpoint", async () => {
    const res = await request(app).get("/api/health/full");
    assert.equal(res.status, 200);
    assert.equal(res.body.endpoint, "/api/health/full");
    assert.equal(res.body.phase, "1461-1500-conoha-vps-auto-deploy");
    const names = res.body.infrastructure.map((c: { name: string }) => c.name);
    assert.ok(names.includes("VPS"));
    assert.ok(names.includes("PostgreSQL") || names.includes("Postgres"));
    assert.ok(names.includes("PLC Gateway"));
    assert.ok(names.includes("RP2350 Gateway"));
  });

  it("GET /api/customers lists demo customers", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    const codes = res.body.customers.map((c: { customer_code: string }) => c.customer_code);
    assert.ok(codes.includes("TOMS001"));
    assert.ok(codes.includes("HOTEL001"));
  });

  it("GET /api/customer/TOMS001/dashboard for viewer", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/dashboard")
      .set("Authorization", `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.cards.deviceCount >= 1);
    assert.ok(["normal", "warning", "abnormal"].includes(res.body.summary.overallStatus));
  });

  it("customer URLs are generated", async () => {
    const res = await request(app)
      .get("/api/customers/by-code/TOMS001")
      .set("Authorization", `Bearer ${customerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.urls.customer, "/customer/TOMS001");
    assert.equal(res.body.urls.tv, "/tv/TOMS001");
    assert.equal(res.body.urls.admin, "/admin/TOMS001");
  });

  it("GET /customer/TOMS001 serves portal HTML", async () => {
    const res = await request(app).get("/customer/TOMS001");
    assert.equal(res.status, 200);
    assert.match(res.text, /customer-home-v1|customer-v1-phase26/);
  });
});

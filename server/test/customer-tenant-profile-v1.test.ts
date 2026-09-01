import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { getDatabase } from "../src/db/database.js";
import {
  resolveCustomerSecuritySiteIdV1,
  resolveCustomerTenantProfileV1,
} from "../src/shared/customer/customer-tenant-profile-v1.js";

process.env.JWT_SECRET = "test-jwt-tenant-profile-v1";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";

const app = createApp();

describe("customer-tenant-profile-v1", () => {
  it("maps TOMS001 to Itabashi live security site", () => {
    const profile = resolveCustomerTenantProfileV1("TOMS001");
    assert.ok(profile);
    assert.equal(profile?.securitySiteId, "SEC-JP-ITABASHI-LIVE");
    assert.equal(profile?.useToshimaDashboard, false);
  });

  it("maps TOSHIMA001 to Toshima dashboard site", () => {
    const profile = resolveCustomerTenantProfileV1("TOSHIMA001");
    assert.ok(profile);
    assert.equal(profile?.securitySiteId, "SEC-JP-TOSHIMA-001");
    assert.equal(profile?.useToshimaDashboard, true);
  });

  it("HOME001 alias resolves to Itabashi", () => {
    assert.equal(
      resolveCustomerSecuritySiteIdV1("HOME001"),
      "SEC-JP-ITABASHI-LIVE"
    );
  });

  it("session-home returns tenant profile for logged-in customer", async () => {
    getDatabase();
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOSHIMA001",
        username: "toshima001.owner",
        password: "demo-remote-2026",
      });
    assert.equal(login.status, 200, login.body?.error);
    const res = await request(app)
      .get("/api/customer-portal/v1/session-home")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.tenantProfile.customerCode, "TOSHIMA001");
    assert.equal(res.body.tenantProfile.securitySiteId, "SEC-JP-TOSHIMA-001");
    assert.ok(res.body.home?.cards?.length >= 0);
  });
});

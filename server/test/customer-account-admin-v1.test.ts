/**
 * 顧客アカウント管理 API v1
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-customer-account-admin-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-customer-account-admin-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import(
  "../src/security/rate-limit.js"
);
const {
  listCameraPreviewsForCustomerV1,
  buildCameraPreviewSessionV1,
} = await import("../src/camera/camera-preview-v1.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: code,
      username,
      password: "demo-remote-2026",
    });
}

describe("customer account admin + camera preview v1", () => {
  let tomsAdmin = "";
  let toyoshimaOwner = "";

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
    resetRateLimitsForTests();
    getDatabase();

    const ta = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(ta.status, 200, ta.body?.error);
    tomsAdmin = ta.body.token;

    const to = await customerLogin("TOYOSHIMA001", "toyoshima001.owner");
    assert.equal(to.status, 200, to.body?.error);
    toyoshimaOwner = to.body.token;
  });

  after(() => closeDatabase());

  it("lists customer accounts for internal ops admin", async () => {
    const res = await request(app)
      .get("/api/customer-portal/v1/admin/accounts")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.accounts));
    assert.ok(res.body.accounts.some((a: { customerCode: string }) => a.customerCode === "TOMS001"));
    assert.ok(res.body.accounts.some((a: { customerCode: string }) => a.customerCode === "TOYOSHIMA001"));
  });

  it("denies account admin for non-internal tenant", async () => {
    const res = await request(app)
      .get("/api/customer-portal/v1/admin/accounts")
      .set("Authorization", `Bearer ${toyoshimaOwner}`);
    assert.equal(res.status, 403);
  });

  it("returns module catalog for internal admin", async () => {
    const res = await request(app)
      .get("/api/customer-portal/v1/admin/accounts/modules")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.modules?.length, 4);
    assert.ok(res.body.modules.some((m: { id: string }) => m.id === "security_floor_v1"));
  });

  it("lists camera previews per tenant", () => {
    const toms = listCameraPreviewsForCustomerV1("TOMS001");
    assert.equal(toms.length, 3);
    assert.ok(toms.some((c) => c.label.includes("玄関")));

    const toy = listCameraPreviewsForCustomerV1("TOYOSHIMA001");
    assert.equal(toy.length, 3);
    assert.ok(toy.some((c) => c.status === "doorbell"));
  });

  it("camera preview API returns list for logged-in customer", async () => {
    const res = await request(app)
      .get("/api/camera-preview/v1/list?customerCode=TOMS001")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.customerCode, "TOMS001");
    assert.equal(res.body.cameras?.length, 3);
  });

  it("camera session uses auth mock stream URL", async () => {
    const session = buildCameraPreviewSessionV1({
      customerCode: "TOMS001",
      cameraId: "cam-entrance",
    });
    assert.ok(session);
    assert.match(session!.streamUrl, /mock-stream-auth/);

    const res = await request(app)
      .get("/api/camera-preview/v1/session/cam-entrance?customerCode=TOMS001")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(res.status, 200);
    assert.match(res.body.session.streamUrl, /mock-stream-auth/);
  });

  it("mock-stream-auth returns SVG for authenticated customer", async () => {
    const res = await request(app)
      .get("/api/camera-preview/v1/mock-stream-auth/cam-entrance")
      .set("Authorization", `Bearer ${tomsAdmin}`);
    assert.equal(res.status, 200);
    const body =
      typeof res.text === "string"
        ? res.text
        : res.body?.toString?.("utf8") ?? "";
    assert.match(res.headers["content-type"] || "", /svg/);
    assert.match(body, /<svg/i);
  });

  it("/app/customer-master-v1 HTML is served", async () => {
    const res = await request(app).get("/app/customer-master-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /customer-master-v1\.js/);
    assert.match(res.text, /顧客アカウント/);
  });
});

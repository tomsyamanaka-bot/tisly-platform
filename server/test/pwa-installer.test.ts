import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-pwa-phase441";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pwa-installer-phase441.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import("../src/security/rate-limit.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: code, username, password: "demo-remote-2026" });
}

describe("Phase 441-460 installer PWA app shell", () => {
  let installerToken = "";

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
    const ti = await customerLogin("TOMS001", "toms001.installer");
    assert.equal(ti.status, 200, ti.body?.error);
    installerToken = ti.body.token;
  });

  after(() => closeDatabase());

  it("serves manifest.webmanifest", async () => {
    const res = await request(app).get("/manifest.webmanifest");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"]?.includes("manifest") || res.type.includes("json"));
    const body = res.body;
    assert.ok(body.icons?.length >= 1);
    assert.equal(body.display, "standalone");
  });

  it("serves per-customer installer manifest", async () => {
    const res = await request(app).get("/customer/TOMS001/install/manifest.webmanifest");
    assert.equal(res.status, 200);
    assert.ok(res.body.start_url.includes("/customer/TOMS001/install/home"));
    assert.ok(res.body.name.includes("施工"));
  });

  it("serves service-worker.js", async () => {
    const res = await request(app).get("/service-worker.js");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("tisly-pwa-v2200-customer-login"));
    assert.ok(res.headers["service-worker-allowed"] === "/");
  });

  it("serves offline fallback page", async () => {
    const res = await request(app).get("/offline");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("オフライン"));
  });

  it("serves survey placeholder", async () => {
    const res = await request(app).get("/survey");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("現調 Survey"));
    assert.ok(res.text.includes("見積候補"));
    assert.ok(res.text.includes("案件管理"));
  });

  it("installer home page has iOS meta and Android install UI", async () => {
    const res = await request(app).get("/customer/TOMS001/install/home");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('apple-mobile-web-app-capable'));
    assert.ok(res.text.includes('apple-touch-icon'));
    assert.ok(res.text.includes('id="btn-pwa-install"'));
  });

  it("install guide page exists", async () => {
    const res = await request(app).get("/customer/TOMS001/install/guide");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("iPhone"));
    assert.ok(res.text.includes("btn-android-install"));
  });

  it("installer role blocked from customer users list", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/users")
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes("Installer"));
  });

  it("installer can access install dashboard API", async () => {
    const res = await request(app)
      .get("/api/customer/TOMS001/install/dashboard")
      .set("Authorization", `Bearer ${installerToken}`);
    assert.equal(res.status, 200);
  });

  it("PWA icons are served", async () => {
    for (const size of [192, 512]) {
      const res = await request(app).get(`/icons/icon-${size}.png`);
      assert.equal(res.status, 200, `icon-${size}`);
      assert.ok(res.headers["content-type"]?.includes("image"));
    }
  });
});

/**
 * QNAP ネットワーク診断 / Ping API / 保存ルート v1
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-qnap-net-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-qnap-network-diagnose-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER = "mock";
process.env.STORAGE_PROVIDER_MOCK = "true";
process.env.QNAP_STORAGE_MOCK = "true";
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;
delete process.env.QNAP_LOCAL_WEBDAV_URL;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-qnap-network-diagnose-v1.db";

const app = createApp();

async function ownerLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.owner", password: "demo-remote-2026" });
}

describe("QNAP network diagnose v1", () => {
  let ownerToken = "";

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
    const login = await ownerLogin();
    assert.equal(login.status, 200, login.body?.error);
    ownerToken = login.body.token;
  });

  after(() => closeDatabase());

  it("classifyQnapNetworkError maps common codes", async () => {
    const { classifyQnapNetworkError } = await import(
      "../src/storage/qnap-network-diagnose-v1.js"
    );
    assert.equal(classifyQnapNetworkError("connect ECONNREFUSED").errorCode, "ECONNREFUSED");
    assert.equal(classifyQnapNetworkError("WebDAV timeout", null).errorCode, "ETIMEDOUT");
    assert.equal(classifyQnapNetworkError("fail", 401).errorCode, "401 Unauthorized");
  });

  it("GET /api/estimate/v1/qnap/ping returns structured diagnose", async () => {
    const res = await request(app)
      .get("/api/estimate/v1/qnap/ping")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.ok([200, 502].includes(res.status));
    assert.equal(typeof res.body.ok, "boolean");
    assert.equal(typeof res.body.reachable, "boolean");
    assert.ok(Array.isArray(res.body.logs));
    assert.ok(Array.isArray(res.body.candidates));
    assert.ok(res.body.testedAt);
    assert.ok(["auto", "vps", "local_wifi"].includes(res.body.saveRoute));
  });

  it("POST /api/storage/v1/settings/qnap/ping works for owner", async () => {
    const res = await request(app)
      .post("/api/storage/v1/settings/qnap/ping")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    assert.ok([200, 502].includes(res.status));
    assert.ok(res.body.message);
    assert.ok(Array.isArray(res.body.logs));
  });

  it("PUT saveRoute local_wifi persists", async () => {
    const res = await request(app)
      .put("/api/storage/v1/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        localStorageEnabled: true,
        qnapBackupEnabled: true,
        saveRoute: "local_wifi",
        qnap: {
          host: "192.168.1.50",
          port: 8080,
          shareName: "TiSLY",
          username: "admin",
          password: "secret",
        },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.saveRoute, "local_wifi");
    assert.equal(res.body.summary.saveRoute, "local_wifi");
    assert.match(res.body.summary.saveRouteLabel, /ローカル/);
  });

  it("client-direct-config available when LAN host set", async () => {
    const res = await request(app)
      .get("/api/estimate/v1/qnap/client-direct-config")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.available, true);
    assert.ok(res.body.webdavUrl?.includes("192.168.1.50"));
    assert.equal(res.body.saveRoute, "local_wifi");
  });

  it("storage settings UI mentions save route and ping", () => {
    const html = fs.readFileSync(
      new URL("../public/storage-settings-v1.html", import.meta.url),
      "utf8"
    );
    const js = fs.readFileSync(
      new URL("../public/js/storage-settings-v1.js", import.meta.url),
      "utf8"
    );
    assert.match(html, /qnap-save-route/);
    assert.match(html, /btn-ping/);
    assert.match(html, /btn-local-ping/);
    assert.match(html, /btn-connect-ping/);
    assert.match(html, /接続テスト \(Ping\)/);
    assert.match(js, /qnap\/ping/);
    assert.match(js, /resolveLocalWebDavWithPortFallback/);
    assert.match(js, /runConnectPingFlow/);
  });

  it("estimate-v1 uses VPS proxy only (no client direct save fallback)", () => {
    const js = fs.readFileSync(
      new URL("../public/js/estimate-v1.js", import.meta.url),
      "utf8"
    );
    assert.match(js, /qnap-client-direct-v1/);
    assert.match(js, /documentNasSaveSuccessMessage/);
    assert.match(js, /VPS プロキシのみ/);
    assert.doesNotMatch(js, /saveProjectPdfsViaLocalWebDav/);
    assert.doesNotMatch(js, /shouldTryClientDirectFallback/);
  });

  it("troubleshooting doc exists at repo root", () => {
    const doc = fs.readFileSync(
      new URL("../../QNAP_NETWORK_TROUBLESHOOTING.md", import.meta.url),
      "utf8"
    );
    assert.match(doc, /tailscale status/);
    assert.match(doc, /QNAP_WEBDAV_URL/);
    assert.match(doc, /5006/);
  });
});

import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-storage-settings-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER = "mock";
process.env.STORAGE_PROVIDER_MOCK = "true";
delete process.env.QNAP_STORAGE_FORCE_REAL;
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;
process.env.QNAP_STORAGE_MOCK = "true";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  STORAGE_SETTINGS_KEY,
  DEFAULT_STORAGE_SETTINGS,
} = await import("../src/storage/storage-settings-store.js");

// dotenv override 対策 — createApp 後にテスト用パスを再適用
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-storage-settings-v1.db";
process.env.STORAGE_PROVIDER = "mock";
process.env.STORAGE_PROVIDER_MOCK = "true";
process.env.QNAP_STORAGE_MOCK = "true";
delete process.env.QNAP_STORAGE_FORCE_REAL;
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;

const app = createApp();

async function ownerLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.owner", password: "demo-remote-2026" });
}

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

function resetStorageSettingsRow() {
  getDatabase()
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .run(
      STORAGE_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_STORAGE_SETTINGS,
        qnap: { host: "", port: 8080, shareName: "TiSLY", username: "", password: "" },
        updatedAt: new Date().toISOString(),
      })
    );
}

describe("Storage settings v1 — QNAP 接続設定", () => {
  let ownerToken = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.TISLY_DB_PATH = "./data/test-storage-settings-v1.db";
    process.env.STORAGE_PROVIDER = "mock";
    process.env.STORAGE_PROVIDER_MOCK = "true";
    process.env.QNAP_STORAGE_MOCK = "true";
    delete process.env.QNAP_STORAGE_FORCE_REAL;
    delete process.env.QNAP_WEBDAV_URL;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_WEBDAV_PASSWORD;
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
    resetStorageSettingsRow();
    const login = await ownerLogin();
    assert.equal(login.status, 200, login.body?.error);
    ownerToken = login.body.token;
  });

  after(() => closeDatabase());

  it("GET /settings-v1 ページを配信", async () => {
    const res = await request(app).get("/settings-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("設定メニュー"));
  });

  it("GET /storage-settings-v1 ページを配信", async () => {
    const res = await request(app).get("/storage-settings-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("接続テスト（Ping）"));
    assert.ok(res.text.includes("VPS .env"));
    assert.ok(res.text.includes("btn-connect-ping"));
    assert.ok(res.text.includes("自動（推奨）"));
    assert.ok(res.text.includes("ローカルLAN IP"));
  });

  it("GET /api/storage/v1/settings — owner", async () => {
    const res = await request(app)
      .get("/api/storage/v1/settings")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.localStorageEnabled, true);
    assert.equal(res.body.summary.qnapLabel, "未設定");
    assert.equal(res.body.settings.qnap.hasPassword, false);
  });

  it("surveyor は 403", async () => {
    const login = await surveyorLogin();
    const res = await request(app)
      .get("/api/storage/v1/settings")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 403);
  });

  it("PUT 設定保存 + QNAP 有効化", async () => {
    const res = await request(app)
      .put("/api/storage/v1/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        localStorageEnabled: true,
        qnapBackupEnabled: true,
        qnap: {
          host: "192.168.1.100",
          port: 8080,
          shareName: "TiSLY",
          username: "admin",
          password: "secret-qnap",
        },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.qnapBackupEnabled, true);
    assert.equal(res.body.settings.qnap.host, "192.168.1.100");
    assert.equal(res.body.settings.qnap.hasPassword, true);
  });

  it("POST QNAP接続確認 — モック成功", async () => {
    const res = await request(app)
      .post("/api/storage/v1/settings/qnap/test-connection")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.result.mock, true);
    assert.equal(res.body.result.steps?.length, 7);
    assert.ok(res.body.qnapEnv);
  });

  it("POST テストPDF送信 — モック成功", async () => {
    const res = await request(app)
      .post("/api/storage/v1/settings/qnap/test-pdf")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.result.mock, true);
    const mirror = path.join(process.cwd(), "uploads", "qnap-storage-mock", "TiSLY", "Test", "tisly-test.pdf");
    assert.ok(fs.existsSync(mirror));
  });

  it("buildWebDavUrl", async () => {
    const { buildWebDavUrl } = await import("../src/storage/qnap-storage-service.js");
    assert.equal(buildWebDavUrl("192.168.1.100", 8080, "TiSLY"), "http://192.168.1.100:8080/TiSLY");
    assert.equal(buildWebDavUrl("nas.local", 5001, "TiSLY"), "https://nas.local:5001/TiSLY");
  });

  it("storage HTML/JS に必須 UI 要素", async () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), "public/storage-settings-v1.html"),
      "utf8"
    );
    const js = fs.readFileSync(
      path.join(process.cwd(), "public/js/storage-settings-v1.js"),
      "utf8"
    );
    assert.match(html, /btn-test-connection/);
    assert.match(html, /btn-test-pdf/);
    assert.match(html, /qnap-save-route/);
    assert.match(html, /btn-ping/);
    assert.match(html, /btn-connect-ping/);
    assert.match(html, /ping-indicator/);
    assert.match(html, /自動（推奨）/);
    assert.match(html, /ローカルWi-Fi経由/);
    assert.match(html, /VPS（Tailscale）経由/);
    assert.match(js, /test-connection/);
    assert.match(js, /test-pdf/);
    assert.match(js, /saveRoute/);
    assert.match(js, /runConnectPingFlow/);
    assert.match(js, /setPingIndicator/);
  });
});

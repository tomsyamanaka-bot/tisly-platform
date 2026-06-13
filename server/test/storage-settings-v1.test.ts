import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-storage-settings-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

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

describe("Storage settings v1 — QNAP 接続設定", () => {
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

  it("GET /settings-v1 ページを配信", async () => {
    const res = await request(app).get("/settings-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("設定メニュー"));
  });

  it("GET /storage-settings-v1 ページを配信", async () => {
    const res = await request(app).get("/storage-settings-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("QNAP接続確認"));
    assert.ok(res.text.includes("テストPDF送信"));
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
    assert.equal(res.body.summary.qnapLabel, "接続成功");
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
    assert.match(js, /test-connection/);
    assert.match(js, /test-pdf/);
  });
});

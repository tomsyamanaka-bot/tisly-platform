import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildRealDataMigrationCheck } from "../src/deploy/real-data-migration-check.js";
import { resolveProFloorImageUrl } from "../src/pro-remote/floor-map-stack.js";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../src/pwa/pwa-shell-version.js";
import { isAllowedInstallPhotoFile } from "../src/installer/install-photos.js";

process.env.JWT_SECRET = "test-phase2201-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2201-2250.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(repoRoot, "server/public");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

async function maintenanceLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.maintenance",
      password: "demo-remote-2026",
    });
}

async function installerLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.installer",
      password: "demo-remote-2026",
    });
}

describe("Phase 2201-2250 real data migration", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("real-data-migration-check builder", () => {
    it("buildRealDataMigrationCheck reports ready", () => {
      const report = buildRealDataMigrationCheck();
      assert.equal(report.phase, "2201-2250");
      assert.equal(report.shellVersion, PWA_SHELL_VERSION);
      assert.equal(report.shellTag, PWA_SHELL_TAG);
      assert.ok(report.implemented.length >= 6);
      assert.ok(report.mockRemaining.length >= 3);
      assert.ok(report.productionRatePercent >= 80);
      assert.ok(report.checks.every((c) => c.ok));
      assert.ok(report.ready);
    });
  });

  describe("GET /api/deploy/real-data-check", () => {
    it("returns migration report JSON", async () => {
      const res = await request(app).get("/api/deploy/real-data-check");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2201-2250");
      assert.ok(res.body.ready);
      assert.ok(Array.isArray(res.body.implemented));
      assert.ok(Array.isArray(res.body.mockRemaining));
    });
  });

  describe("floor map SVG URL", () => {
    it("resolves /assets/demo-floor paths unchanged", () => {
      assert.equal(resolveProFloorImageUrl("/assets/demo-floor/perimeter.svg"), "/assets/demo-floor/perimeter.svg");
    });
  });

  describe("maintenance inspection API", () => {
    it("GET/POST /api/maintenance/inspection persists memo", async () => {
      const login = await maintenanceLogin();
      assert.equal(login.status, 200, login.body?.error);
      const token = login.body.token as string;

      const get0 = await request(app)
        .get("/api/maintenance/inspection/TOMS001")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(get0.status, 200);
      assert.equal(get0.body.memo, "");

      const post = await request(app)
        .post("/api/maintenance/inspection")
        .set("Authorization", `Bearer ${token}`)
        .send({ customerCode: "TOMS001", memo: "月次点検メモ Phase2201" });
      assert.equal(post.status, 200);
      assert.equal(post.body.memo, "月次点検メモ Phase2201");

      const get1 = await request(app)
        .get("/api/maintenance/inspection/TOMS001")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(get1.status, 200);
      assert.equal(get1.body.memo, "月次点検メモ Phase2201");
    });
  });

  describe("install photo upload to customer-files", () => {
    it("accepts jpg and rejects gif", async () => {
      assert.ok(isAllowedInstallPhotoFile("photo.jpg"));
      assert.ok(isAllowedInstallPhotoFile("photo.png"));
      assert.ok(!isAllowedInstallPhotoFile("photo.gif"));

      const login = await installerLogin();
      assert.equal(login.status, 200);
      const token = login.body.token as string;
      const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

      const ok = await request(app)
        .post("/api/customer/TOMS001/install/photos/upload")
        .set("Authorization", `Bearer ${token}`)
        .send({
          imageBase64: tinyPng,
          fileName: "test-phase2201.png",
          photoType: "construction",
        });
      assert.equal(ok.status, 201);
      assert.ok(ok.body.url.startsWith("/customer-files/"));

      const bad = await request(app)
        .post("/api/customer/TOMS001/install/photos/upload")
        .set("Authorization", `Bearer ${token}`)
        .send({
          imageBase64: tinyPng,
          fileName: "test.gif",
          photoType: "construction",
        });
      assert.equal(bad.status, 400);
    });
  });

  describe("PRO Remote MQTT status", () => {
    it("GET mqtt-status returns broker and counters", async () => {
      const login = await maintenanceLogin();
      const token = login.body.token as string;
      const res = await request(app)
        .get("/api/customer/TOMS001/pro-remote/mqtt-status")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.broker, "mqtt.tisly.jp");
      assert.ok("messageCount" in res.body);
      assert.ok("lastReceivedAt" in res.body);
      assert.ok(["connected", "mock", "disconnected"].includes(res.body.connectionState));
    });
  });

  describe("customer portal events API", () => {
    it("returns events from database", async () => {
      const login = await request(app)
        .post("/api/auth/customer/login")
        .send({
          customerCode: "TOMS001",
          username: "toms001.owner",
          password: "demo-remote-2026",
        });
      const token = login.body.token as string;
      const res = await request(app)
        .get("/api/customer/TOMS001/events?limit=5")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.events));
    });
  });

  describe("static assets", () => {
    it("pro-remote page includes MQTT panel and mock banner shell", async () => {
      const res = await request(app).get("/customer/TOMS001/pro-remote");
      assert.equal(res.status, 200);
      assert.match(res.text, /pro-mqtt-connection/);
      assert.match(res.text, /pro-remote-mqtt-panel/);
    });

    it("tisly-pwa-shell includes mock-real banner", () => {
      const shell = fs.readFileSync(path.join(publicDir, "js/tisly-pwa-shell.js"), "utf8");
      assert.match(shell, /tisly-mock-real-banner/);
    });

    it("service worker uses v2350-production tag", () => {
      const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf8");
      assert.match(sw, /v2350-production/);
    });
  });
});

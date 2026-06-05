import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  MOCK_REAL_GUARDS,
  checkProductionEnv,
  hasBlockingEnvErrors,
  logProductionEnvWarnings,
} from "../src/config/production-env-checker.js";
import {
  RC2_PRODUCTION_ROUTES,
  buildRc2CheckUrls,
  resolveProductionRoutePath,
} from "../src/config/production-routes.js";

process.env.JWT_SECRET = "test-phase1201-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1201-1240.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.SHELLY_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.DB_PROVIDER = "sqlite";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
let viewerToken = "";

describe("Phase 1201-1240 RC2 Pre-Production Deploy Foundation", () => {
  before(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const viewer = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "TOMS001",
        username: "toms001.viewer",
        password: "demo-remote-2026",
      });
    assert.equal(viewer.status, 200);
    viewerToken = viewer.body.token;
  });

  after(() => closeDatabase());

  describe("production env checker", () => {
    it("warns when JWT_SECRET missing", () => {
      const items = checkProductionEnv({ NODE_ENV: "production" });
      const jwt = items.find((i) => i.key === "JWT_SECRET");
      assert.ok(jwt);
      assert.equal(jwt.level, "error");
    });

    it("warns when ADMIN_PASSWORD_HASH missing", () => {
      const items = checkProductionEnv({
        NODE_ENV: "production",
        JWT_SECRET: "a".repeat(32),
      });
      const admin = items.find((i) => i.key === "ADMIN_PASSWORD_HASH");
      assert.ok(admin);
      assert.equal(admin.level, "error");
    });

    it("errors when MQTT_MODE=real without MQTT_URL", () => {
      const items = checkProductionEnv({
        NODE_ENV: "production",
        JWT_SECRET: "b".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        MQTT_MODE: "real",
      });
      const mqtt = items.find((i) => i.key === "MQTT_URL");
      assert.ok(mqtt);
      assert.equal(mqtt.level, "error");
    });

    it("errors when SHELLY_MODE=real without SHELLY_BASE_URL", () => {
      const items = checkProductionEnv({
        NODE_ENV: "production",
        JWT_SECRET: "c".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        SHELLY_MODE: "real",
      });
      const shelly = items.find((i) => i.key === "SHELLY_BASE_URL");
      assert.ok(shelly);
      assert.equal(shelly.level, "error");
    });

    it("errors when QNAP_UPLOAD_MODE=real without QNAP_WEBDAV_URL", () => {
      const items = checkProductionEnv({
        NODE_ENV: "production",
        JWT_SECRET: "d".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        QNAP_UPLOAD_MODE: "real",
      });
      const qnap = items.find((i) => i.key === "QNAP_WEBDAV_URL");
      assert.ok(qnap);
      assert.equal(qnap.level, "error");
    });

    it("errors when GMAIL_SEND_MODE=real without GOOGLE_OAUTH_ENABLED", () => {
      const items = checkProductionEnv({
        NODE_ENV: "production",
        JWT_SECRET: "e".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        GMAIL_SEND_MODE: "real",
        GOOGLE_OAUTH_ENABLED: "false",
      });
      const oauth = items.find((i) => i.key === "GOOGLE_OAUTH_ENABLED");
      assert.ok(oauth);
      assert.equal(oauth.level, "error");
    });

    it("mock mode is demo-safe (info for MQTT_MODE)", () => {
      const items = checkProductionEnv({
        NODE_ENV: "development",
        JWT_SECRET: "f".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        MQTT_MODE: "mock",
        SHELLY_MODE: "mock",
        QNAP_UPLOAD_MODE: "mock",
      });
      const mqttInfo = items.find((i) => i.key === "MQTT_MODE" && i.level === "info");
      assert.ok(mqttInfo);
      assert.ok(!hasBlockingEnvErrors({
        NODE_ENV: "development",
        JWT_SECRET: "f".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
      }));
    });

    it("MOCK_REAL_GUARDS covers Gmail QNAP Shelly MQTT Google TV", () => {
      const services = MOCK_REAL_GUARDS.map((g) => g.service);
      assert.ok(services.some((s) => s.includes("Gmail")));
      assert.ok(services.some((s) => s.includes("QNAP")));
      assert.ok(services.some((s) => s.includes("Shelly")));
      assert.ok(services.some((s) => s.includes("MQTT")));
      assert.ok(services.some((s) => s.includes("Google TV")));
      for (const guard of MOCK_REAL_GUARDS) {
        assert.ok(guard.realRisks.length >= 1);
        assert.ok(guard.guardLocation.length >= 3);
      }
    });

    it("logProductionEnvWarnings skips NODE_ENV=test", () => {
      assert.doesNotThrow(() => logProductionEnvWarnings({ NODE_ENV: "test" }));
    });
  });

  describe("production route list", () => {
    it("RC2_PRODUCTION_ROUTES has 9 required paths", () => {
      const paths = RC2_PRODUCTION_ROUTES.map((r) => r.path);
      assert.deepEqual(paths, [
        "/app",
        "/survey",
        "/business",
        "/sales",
        "/customer/:code",
        "/customer/:code/pro-remote",
        "/customer/:code/install/home",
        "/tv/:code",
        "/deployment/checklist",
      ]);
    });

    it("buildRc2CheckUrls uses tisly.jp base", () => {
      const urls = buildRc2CheckUrls();
      assert.equal(urls.length, 9);
      assert.ok(urls.every((u) => u.startsWith("https://tisly.jp/")));
      assert.ok(urls.some((u) => u.includes("/customer/TOMS001/pro-remote")));
      assert.ok(urls.some((u) => u.includes("/tv/TOMS001")));
    });

    it("all RC2 HTML routes return 200", async () => {
      for (const spec of RC2_PRODUCTION_ROUTES) {
        const routePath = resolveProductionRoutePath(spec);
        const res = await request(app).get(routePath);
        assert.equal(res.status, 200, `${routePath} should return 200`);
        if (spec.htmlFile) {
          assert.ok(
            res.text.includes("<") || res.type.includes("html"),
            `${routePath} should serve HTML`
          );
        }
      }
    });

    it("docs/production_routes.md exists and lists key paths", () => {
      const docPath = path.join(repoRoot, "docs/production_routes.md");
      assert.ok(fs.existsSync(docPath));
      const content = fs.readFileSync(docPath, "utf8");
      for (const spec of RC2_PRODUCTION_ROUTES) {
        assert.ok(content.includes(spec.path), `doc missing ${spec.path}`);
      }
    });
  });

  describe("rc2 pre-deploy checklist", () => {
    it("docs/rc2_pre_deploy_checklist.md exists with build steps", () => {
      const docPath = path.join(repoRoot, "docs/rc2_pre_deploy_checklist.md");
      assert.ok(fs.existsSync(docPath));
      const content = fs.readFileSync(docPath, "utf8");
      assert.ok(content.includes("npm run build"));
      assert.ok(content.includes("npx tsc --noEmit"));
      assert.ok(content.includes("npm run test"));
      assert.ok(content.includes("/sales"));
      assert.ok(content.includes("/survey"));
      assert.ok(content.includes("/business"));
      assert.ok(content.includes("/customer/TOMS001/pro-remote"));
      assert.ok(content.includes("/tv/TOMS001"));
      assert.ok(content.includes("/deployment/checklist"));
      assert.ok(content.includes("roof"));
    });

    it("docs/tisly_jp_deploy_runbook.md exists", () => {
      const docPath = path.join(repoRoot, "docs/tisly_jp_deploy_runbook.md");
      assert.ok(fs.existsSync(docPath));
      const content = fs.readFileSync(docPath, "utf8");
      assert.ok(content.includes("systemd"));
      assert.ok(content.includes("Let's Encrypt"));
      assert.ok(content.includes("Rollback"));
      assert.ok(content.includes("JWT_SECRET"));
    });

    it("Google TV focus API mock works", async () => {
      const tv = await request(app).post("/api/tv/focus-camera").send({
        customerCode: "TOMS001",
        cameraId: "CAM-RC2-PRE",
        floor: "2f",
        trigger: "rc2-checklist",
        durationSec: 10,
      });
      assert.equal(tv.status, 201);
      assert.equal(tv.body.event, "focusCamera");

      const state = await request(app).get("/api/tv/TOMS001/state");
      assert.equal(state.status, 200);
      assert.equal(state.body.focusCamera.active, true);
      assert.equal(state.body.focusCamera.cameraId, "CAM-RC2-PRE");
    });

    it("floor stack RC2: perimeter/1f/2f and no roof", async () => {
      const stack = await request(app)
        .get("/api/customer/TOMS001/pro-remote/floor-stack?rc=2")
        .set("Authorization", `Bearer ${viewerToken}`);
      assert.equal(stack.status, 200);
      assert.deepEqual(stack.body.tiers, ["perimeter", "1f", "2f"]);
      assert.ok(!stack.body.tiers.includes("roof"));
      const tierIds = stack.body.layers.map((l: { tier: string }) => l.tier);
      assert.ok(tierIds.includes("perimeter") || tierIds.includes("1f"));
    });
  });
});

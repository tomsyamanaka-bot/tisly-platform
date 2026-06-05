import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  RC2_PRODUCTION_ROUTES,
  buildRc2CheckUrls,
} from "../src/config/production-routes.js";
import {
  buildPwaPublishAudit,
  NGINX_REQUIRED_ROUTE_PREFIXES,
  PWA_AUDIT_SPECS,
} from "../src/pwa/pwa-publish-audit.js";

process.env.JWT_SECRET = "test-phase1241-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1241-1280.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = hashPassword("testpass");
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TISLY_PUBLIC_URL = "https://tisly.jp";
process.env.MQTT_MODE = "mock";
process.env.MQTT_MOCK_MODE = "true";
process.env.SHELLY_MODE = "mock";
process.env.QNAP_UPLOAD_MODE = "mock";
process.env.GOOGLE_OAUTH_ENABLED = "false";
process.env.GMAIL_SEND_MODE = "mock";
process.env.DB_PROVIDER = "sqlite";
process.env.TISLY_DEMO_MODE = "false";
process.env.DEMO_RESET_ENABLED = "false";

const dbPath = process.env.TISLY_DB_PATH;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();

describe("Phase 1241-1280 Production Deploy Package", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("production url list", () => {
    it("RC2_PRODUCTION_ROUTES has 9 tisly.jp paths", () => {
      assert.equal(RC2_PRODUCTION_ROUTES.length, 9);
      const urls = buildRc2CheckUrls();
      assert.equal(urls.length, 9);
      assert.ok(urls.every((u) => u.startsWith("https://tisly.jp/")));
    });

    it("docs/production_routes.md lists all RC2 paths", () => {
      const doc = fs.readFileSync(path.join(repoRoot, "docs/production_routes.md"), "utf8");
      for (const r of RC2_PRODUCTION_ROUTES) {
        assert.ok(doc.includes(r.path), `missing ${r.path}`);
      }
    });
  });

  describe("nginx route doc", () => {
    it("tisly.jp.conf exists with all required route prefixes", () => {
      const confPath = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
      assert.ok(fs.existsSync(confPath));
      const conf = fs.readFileSync(confPath, "utf8");
      for (const prefix of NGINX_REQUIRED_ROUTE_PREFIXES) {
        assert.ok(conf.includes(prefix), `nginx conf missing ${prefix}`);
      }
      assert.ok(conf.includes("service-worker.js"));
      assert.ok(conf.includes("manifest"));
      assert.ok(conf.includes("/customer/"));
      assert.ok(conf.includes("X-Forwarded-Proto"));
      assert.ok(conf.includes("install/home") || conf.includes("/customer/"));
    });

    it("runbook references nginx template and HTTPS", () => {
      const runbook = fs.readFileSync(
        path.join(repoRoot, "docs/tisly_jp_deploy_runbook.md"),
        "utf8"
      );
      assert.ok(runbook.includes("nginx"));
      assert.ok(runbook.includes("Let's Encrypt"));
      assert.ok(runbook.includes(".env.production"));
      assert.ok(runbook.includes("Rollback") || runbook.includes("ロールバック"));
    });
  });

  describe("env production example", () => {
    it(".env.production.example has required keys", () => {
      const envPath = path.join(serverRoot, ".env.production.example");
      assert.ok(fs.existsSync(envPath));
      const content = fs.readFileSync(envPath, "utf8");
      const required = [
        "NODE_ENV=production",
        "TISLY_PUBLIC_URL=https://tisly.jp",
        "PORT=3080",
        "DB_PROVIDER=sqlite",
        "TISLY_DEMO_MODE=false",
        "DEMO_RESET_ENABLED=false",
        "GMAIL_SEND_MODE=mock",
        "QNAP_UPLOAD_MODE=mock",
        "MQTT_MOCK_MODE=true",
        "SHELLY_MODE=mock",
        "JWT_SECRET=",
        "ADMIN_PASSWORD_HASH=",
        "MQTT_URL",
        "MQTT_USERNAME",
        "MQTT_PASSWORD",
        "SHELLY_BASE_URL",
        "QNAP_WEBDAV_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REFRESH_TOKEN",
      ];
      for (const key of required) {
        assert.ok(content.includes(key), `missing ${key}`);
      }
    });
  });

  describe("pwa publish audit", () => {
    it("buildPwaPublishAudit returns all PWA fields", () => {
      const report = buildPwaPublishAudit({
        NODE_ENV: "production",
        TISLY_PUBLIC_URL: "https://tisly.jp",
        JWT_SECRET: "a".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
        MQTT_MODE: "mock",
        SHELLY_MODE: "mock",
        QNAP_UPLOAD_MODE: "mock",
        GMAIL_SEND_MODE: "mock",
      });
      assert.equal(report.isProductionUrl, true);
      assert.ok(report.pwAs.length >= PWA_AUDIT_SPECS.length);
      for (const p of report.pwAs) {
        assert.ok(p.pwaName);
        assert.ok(p.productionUrl.startsWith("https://tisly.jp"));
        assert.ok(p.localUrl.startsWith("http://localhost"));
        assert.ok(typeof p.installReady === "boolean");
        assert.ok(Array.isArray(p.missingItems));
        assert.ok(p.recommendedAction);
        assert.ok(["ok", "caution", "not_ready"].includes(p.status));
        if (p.isPwa) {
          assert.ok(p.manifestUrl || p.id === "sales");
          assert.ok(p.serviceWorker);
          assert.ok(p.scope);
          assert.ok(p.startUrl);
        }
      }
      assert.ok(report.mockReal.length >= 5);
      assert.ok(report.summary.ok + report.summary.caution + report.summary.notReady === report.pwAs.length);
    });

    it("GET /api/pwa/publish-audit returns audit JSON", async () => {
      const res = await request(app).get("/api/pwa/publish-audit");
      assert.equal(res.status, 200);
      assert.ok(res.body.pwAs);
      assert.ok(res.body.tislyPublicUrl);
      assert.ok(typeof res.body.isProductionUrl === "boolean");
      const survey = res.body.pwAs.find((p: { id: string }) => p.id === "survey");
      assert.ok(survey);
      assert.equal(survey.pwaName, "現調 PWA");
      assert.ok(survey.productionUrl.includes("/survey"));
      assert.ok(survey.manifestUrl.includes("manifest"));
    });

    it("flags localhost TISLY_PUBLIC_URL as not production", () => {
      const report = buildPwaPublishAudit({
        NODE_ENV: "production",
        TISLY_PUBLIC_URL: "http://localhost:3080",
        JWT_SECRET: "b".repeat(32),
        ADMIN_PASSWORD_HASH: "hash",
      });
      assert.equal(report.isProductionUrl, false);
      const pwa = report.pwAs.find((p) => p.id === "survey");
      assert.ok(pwa);
      assert.equal(pwa.installReady, false);
      assert.ok(pwa.missingItems.some((m) => m.includes("TISLY_PUBLIC_URL")));
    });
  });

  describe("no localhost leak in production config", () => {
    it(".env.production.example uses tisly.jp not localhost", () => {
      const content = fs.readFileSync(
        path.join(serverRoot, ".env.production.example"),
        "utf8"
      );
      const publicUrlLine = content
        .split("\n")
        .find((l) => l.startsWith("TISLY_PUBLIC_URL="));
      assert.ok(publicUrlLine);
      assert.ok(publicUrlLine.includes("https://tisly.jp"));
      assert.ok(!publicUrlLine.includes("localhost"));
      assert.ok(!publicUrlLine.includes("127.0.0.1"));
    });

    it("nginx conf proxies to 127.0.0.1:3080 only in upstream (not public URL)", () => {
      const conf = fs.readFileSync(
        path.join(serverRoot, "deploy/nginx/tisly.jp.conf"),
        "utf8"
      );
      assert.ok(conf.includes("127.0.0.1:3080"));
      assert.ok(!conf.includes("https://localhost"));
      assert.ok(!conf.match(/server_name\s+localhost/));
    });

    it("rc2 checklist documents iPhone/Android PWA install", () => {
      const checklist = fs.readFileSync(
        path.join(repoRoot, "docs/rc2_pre_deploy_checklist.md"),
        "utf8"
      );
      assert.ok(checklist.includes("iPhone"));
      assert.ok(checklist.includes("Android"));
      assert.ok(checklist.includes("/survey"));
      assert.ok(checklist.includes("/app"));
      assert.ok(checklist.includes(".env.production"));
      assert.ok(checklist.includes("mock 維持"));
    });
  });

  describe("app hub publish check UI", () => {
    it("/app HTML includes publish audit panel", async () => {
      const res = await request(app).get("/app");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("publish-audit-panel"));
      assert.ok(res.text.includes("本番公開チェック"));
    });

    it("app-hub.js loads publish audit", () => {
      const js = fs.readFileSync(path.join(serverRoot, "public/js/app-hub.js"), "utf8");
      assert.ok(js.includes("publish-audit"));
      assert.ok(js.includes("/api/pwa/publish-audit"));
      assert.ok(js.includes("btn-copy-url"));
    });
  });
});

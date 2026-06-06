import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import { buildRc2CheckUrls } from "../src/config/production-routes.js";
import { buildDeployDryRun } from "../src/deploy/deploy-dry-run.js";
import { buildProductionUrlAudit } from "../src/deploy/production-url-audit.js";
import { buildProductionReadiness } from "../src/deploy/production-readiness.js";
import { buildReleaseGateInfo } from "../src/deploy/deploy-dry-run.js";
import { buildPwaInstallAudit } from "../src/pwa/pwa-install-audit.js";

process.env.JWT_SECRET = "test-phase1381-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase1381-1400.db";
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

describe("Phase 1381-1400 PWA Production Release Priority", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("production url audit", () => {
    it("scans RC2 routes and reports public-facing violations", () => {
      const audit = buildProductionUrlAudit();
      assert.ok(audit.routes.length >= 7);
      assert.equal(audit.publicFacingClean, true);
      assert.equal(audit.blockingCount, 0);
    });

    it("GET /api/deploy/url-audit returns audit JSON", async () => {
      const res = await request(app).get("/api/deploy/url-audit");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.violations));
      assert.equal(res.body.publicFacingClean, true);
    });
  });

  describe("nginx production doc", () => {
    it("docs/nginx_tisly_production.md covers all routes", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/nginx_tisly_production.md"),
        "utf8"
      );
      for (const route of ["/app", "/survey", "/business", "/customer/", "/tv/", "/api/", "/ws"]) {
        assert.ok(doc.includes(route), `missing ${route}`);
      }
      assert.ok(doc.includes("gzip"));
      assert.ok(doc.includes("ssl") || doc.includes("SSL"));
      assert.ok(doc.includes("WebSocket") || doc.includes("websocket"));
      assert.ok(doc.includes("PWA"));
    });

    it("nginx conf has gzip enabled", () => {
      const conf = fs.readFileSync(
        path.join(serverRoot, "deploy/nginx/tisly.jp.conf"),
        "utf8"
      );
      assert.ok(conf.includes("gzip on"));
    });
  });

  describe("env production example complete", () => {
    it(".env.production.example has Phase 1381 required keys", () => {
      const content = fs.readFileSync(
        path.join(serverRoot, ".env.production.example"),
        "utf8"
      );
      const required = [
        "NODE_ENV=production",
        "TISLY_PUBLIC_URL=https://tisly.jp",
        "JWT_SECRET=",
        "ADMIN_PASSWORD_HASH=",
        "POSTGRES_URL=",
        "MQTT_URL=",
        "MQTT_USERNAME=",
        "MQTT_PASSWORD=",
      ];
      for (const key of required) {
        assert.ok(content.includes(key), `missing ${key}`);
      }
    });
  });

  describe("pwa install audit", () => {
    it("audits manifest icons SW theme-color for target PWAs", () => {
      const audit = buildPwaInstallAudit();
      assert.equal(audit.totalPwa, 6);
      assert.equal(audit.readyCount, audit.totalPwa, `ready ${audit.readyCount}/${audit.totalPwa}`);
      for (const entry of audit.entries) {
        assert.ok(entry.checks.some((c) => c.id === "manifest_link"));
        assert.ok(entry.checks.some((c) => c.id === "theme_color"));
        assert.ok(entry.checks.some((c) => c.id === "service_worker"));
        assert.ok(entry.checks.some((c) => c.id === "icons"));
      }
    });

    it("GET /api/deploy/pwa-install-audit returns JSON", async () => {
      const res = await request(app).get("/api/deploy/pwa-install-audit");
      assert.equal(res.status, 200);
      assert.ok(res.body.entries);
      assert.ok(typeof res.body.readyCount === "number");
    });

    it("PWA icons exist on disk", () => {
      assert.ok(fs.existsSync(path.join(serverRoot, "public/icons/icon-192.png")));
      assert.ok(fs.existsSync(path.join(serverRoot, "public/icons/icon-512.png")));
    });
  });

  describe("production readiness dashboard", () => {
    it("/app HTML includes Production Readiness card", async () => {
      const res = await request(app).get("/app");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("production-readiness-card"));
      assert.ok(res.text.includes("Production Readiness"));
    });

    it("app-hub.js renders production readiness", () => {
      const js = fs.readFileSync(path.join(serverRoot, "public/js/app-hub.js"), "utf8");
      assert.ok(js.includes("renderProductionReadiness"));
      assert.ok(js.includes("production-readiness-grid"));
    });

    it("release-gate API includes productionReadiness", async () => {
      const res = await request(app).get("/api/deploy/release-gate");
      assert.equal(res.status, 200);
      assert.ok(res.body.productionReadiness);
      assert.ok(Array.isArray(res.body.productionReadiness.items));
      const labels = res.body.productionReadiness.items.map((i: { label: string }) => i.label);
      for (const label of [
        "Build OK",
        "Test OK",
        "PWA Ready",
        "Production URL OK",
        "HTTPS Ready",
        "WS Ready",
        "Secret Leak OK",
        "Deploy Ready",
      ]) {
        assert.ok(labels.includes(label), `missing ${label}`);
      }
    });

    it("buildProductionReadiness has 8 checklist items", () => {
      const dryRun = buildDeployDryRun({
        NODE_ENV: "production",
        TISLY_PUBLIC_URL: "https://tisly.jp",
      });
      const readiness = buildProductionReadiness({
        ...dryRun,
        releaseGate: buildReleaseGateInfo(dryRun),
      });
      assert.equal(readiness.items.length, 8);
      assert.ok(
        readiness.publishableLabel === "公開準備完了" || readiness.publishableLabel === "公開準備中"
      );
    });
  });

  describe("vps deploy wizard doc", () => {
    it("docs/tisly_vps_deploy_step_by_step.md is beginner friendly", () => {
      const doc = fs.readFileSync(
        path.join(repoRoot, "docs/tisly_vps_deploy_step_by_step.md"),
        "utf8"
      );
      assert.ok(doc.includes("git clone"));
      assert.ok(doc.includes("npm install"));
      assert.ok(doc.includes("npm run build"));
      assert.ok(doc.includes("systemd"));
      assert.ok(doc.includes("nginx"));
      assert.ok(doc.includes("certbot"));
      assert.ok(doc.includes("https://tisly.jp"));
    });
  });

  describe("production url list", () => {
    it("RC2 URLs use https://tisly.jp only", () => {
      const urls = buildRc2CheckUrls();
      const targets = [
        "/app",
        "/survey",
        "/business",
        "/customer/TOMS001",
        "/customer/TOMS001/pro-remote",
        "/customer/TOMS001/install/home",
        "/deployment/checklist",
      ];
      for (const p of targets) {
        assert.ok(urls.some((u) => u === `https://tisly.jp${p}`), `missing ${p}`);
      }
    });
  });
});

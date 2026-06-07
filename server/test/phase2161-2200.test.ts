import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";
import {
  buildCustomerLoginCheck,
  buildVpsCustomerLoginDeployBlock,
} from "../src/deploy/customer-login-check.js";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../src/pwa/pwa-shell-version.js";

process.env.JWT_SECRET = "test-phase2161-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2161-2200.db";
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

async function customerLogin(username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username,
      password: "demo-remote-2026",
    });
}

describe("Phase 2161-2200 customer login production verification", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  describe("customer-login-check builder", () => {
    it("buildCustomerLoginCheck reports ready with demo users", () => {
      const report = buildCustomerLoginCheck();
      assert.equal(report.phase, "2161-2200");
      assert.equal(report.shellVersion, PWA_SHELL_VERSION);
      assert.equal(report.shellTag, PWA_SHELL_TAG);
      assert.ok(report.customerRouteOk);
      assert.ok(report.authEndpointOk);
      assert.ok(report.loginFormExists);
      assert.ok(report.submitButtonExists);
      assert.ok(report.portalNavHiddenBeforeLogin);
      assert.ok(report.submitHandlerOk);
      assert.ok(report.authApiOk);
      assert.ok(report.demoAccountOk);
      assert.ok(report.postLoginRedirectOk);
      assert.ok(report.demoPasswordConfigured);
      assert.ok(report.customerPortalPrecached);
      assert.ok(report.ready);
      assert.ok(report.demoUsers.includes("toms001.owner"));
      assert.ok(report.demoUsers.includes("toms001.admin"));
      assert.ok(report.demoUsers.includes("toms001.installer"));
      assert.equal(
        report.checks.find((c) => c.id === "demo-account")?.ok,
        true
      );
    });

    it("buildVpsCustomerLoginDeployBlock includes release:gate and customer route curl", () => {
      const block = buildVpsCustomerLoginDeployBlock().join("\n");
      assert.ok(block.includes("git pull origin master"));
      assert.ok(block.includes("npm run release:gate"));
      assert.ok(block.includes("npm run db:init"));
      assert.ok(block.includes("systemctl restart tisly-server"));
      assert.ok(block.includes("nginx -t && systemctl reload nginx"));
      assert.ok(block.includes("customer-login-check"));
      assert.ok(block.includes("customer/TOMS001"));
    });
  });

  describe("GET /api/deploy/customer-login-check", () => {
    it("returns customer login verification JSON without password value", async () => {
      const res = await request(app).get("/api/deploy/customer-login-check");
      assert.equal(res.status, 200);
      assert.equal(res.body.phase, "2161-2200");
      assert.ok(res.body.ready);
      assert.ok(res.body.demoPasswordConfigured);
      assert.ok(Array.isArray(res.body.demoUsers));
      assert.ok(res.body.demoUsers.includes("toms001.owner"));
      assert.equal(res.body.password, undefined);
      assert.equal(res.body.demoPassword, undefined);
    });
  });

  describe("customer portal login UI", () => {
    it("login form submit handler and status messages", async () => {
      const js = fs.readFileSync(path.join(publicDir, "js/customer-portal.js"), "utf8");
      assert.match(js, /loginForm\?\.addEventListener\("submit"/);
      assert.match(js, /setLoginStatus\("通信開始"\)/);
      assert.match(js, /ログイン失敗：HTTP \$\{res\.status\}/);
      assert.match(js, /setLoginStatus\("ログイン処理エラー"\)/);
      assert.match(js, /setLoginStatus\("ログイン成功、移動中"\)/);
    });

    it("nav hidden before login in served HTML", async () => {
      const res = await request(app).get("/customer/TOMS001");
      assert.equal(res.status, 200);
      assert.match(res.text, /id="portal-nav"[^>]*hidden/);
      assert.match(res.text, /id="login-form"/);
      assert.match(res.text, new RegExp(`data-shell-version="${PWA_SHELL_VERSION}"`));
    });

    it("PWA display mode and stale cache detection present", () => {
      const html = fs.readFileSync(path.join(publicDir, "customer-portal.html"), "utf8");
      const js = fs.readFileSync(path.join(publicDir, "js/customer-portal.js"), "utf8");
      assert.match(html, /id="pwa-display-mode"/);
      assert.match(html, /id="customer-portal-update-banner"/);
      assert.match(js, /isStandalonePwa/);
      assert.match(js, /detectStalePortalCache/);
      assert.match(js, /EXPECTED_SW_TAG/);
    });
  });

  describe("PWA shell cache version", () => {
    it("service-worker precaches customer portal assets with new version", () => {
      const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf8");
      assert.match(sw, new RegExp(`v${PWA_SHELL_VERSION}-production`));
      assert.ok(sw.includes("customer-portal.html"));
      assert.ok(sw.includes("customer-portal.js"));
      assert.ok(sw.includes("customer-portal.css"));
    });
  });

  describe("deployment checklist integration", () => {
    it("deployment-checklist.js fetches customer-login-check", () => {
      const js = fs.readFileSync(path.join(publicDir, "js/deployment-checklist.js"), "utf8");
      assert.ok(js.includes("/api/deploy/customer-login-check"));
      assert.ok(js.includes("customer-login-grid"));
      assert.ok(js.includes("/customer/TOMS001 reachable"));
    });

    it("GET /deployment/checklist includes customer login section", async () => {
      const res = await request(app).get("/deployment/checklist");
      assert.equal(res.status, 200);
      assert.ok(res.text.includes("customer-login-grid"));
      assert.ok(res.text.includes("顧客ログイン確認"));
    });
  });

  describe("live auth API", () => {
    it("toms001.owner login succeeds for post-login hub", async () => {
      const res = await customerLogin("toms001.owner");
      assert.equal(res.status, 200, res.body?.error ?? "login failed");
      assert.ok(res.body.token);
      const dash = await request(app)
        .get("/api/customer/TOMS001/dashboard")
        .set("Authorization", `Bearer ${res.body.token}`);
      assert.equal(dash.status, 200);
      assert.equal(dash.body.customer.customerName, "トムズ設備デモ");
    });
  });
});

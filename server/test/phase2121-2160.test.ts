import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-phase2121-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2121-2160.db";
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

describe("Phase 2121-2160 customer login button and nav", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  it("unauthenticated HTML hides portal nav links", async () => {
    const res = await request(app).get("/customer/TOMS001");
    assert.equal(res.status, 200);
    assert.match(res.text, /id="portal-nav"[^>]*hidden/);
    assert.match(res.text, /nav-map/);
    assert.match(res.text, /nav-install/);
    assert.match(res.text, /nav-tv/);
    assert.match(res.text, /nav-admin/);
    assert.match(res.text, /portal-nav\[hidden\]|id="portal-nav"[^>]*hidden/);
  });

  it("login button exists with type submit inside form", async () => {
    const html = fs.readFileSync(path.join(publicDir, "customer-portal.html"), "utf8");
    assert.match(html, /id="login-form"/);
    assert.match(html, /type="submit"[^>]*id="btn-login"/);
    assert.match(html, /id="login-status"/);
  });

  it("portal JS wires form submit and login API payload", async () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-portal.js"), "utf8");
    assert.match(js, /loginForm\?\.addEventListener\("submit"/);
    assert.match(js, /e\.preventDefault\(\)/);
    assert.match(js, /performLogin/);
    assert.match(js, /\/api\/auth\/customer\/login/);
    assert.match(js, /customerCode,\s*username,\s*password/);
    assert.match(js, /setCustomerToken/);
    assert.match(js, /location\.replace/);
    assert.match(js, /setPwaTopbarVisible\(false\)/);
    assert.match(js, /portalNav\.hidden = true/);
    assert.match(js, /setLoginStatus\(`ログイン失敗：HTTP \$\{res\.status\}`\)/);
    assert.match(js, /setLoginStatus\("通信開始"\)/);
    assert.match(js, /setLoginStatus\("ログイン成功、移動中"\)/);
  });

  it("toms001.owner login succeeds via API", async () => {
    const res = await customerLogin("toms001.owner");
    assert.equal(res.status, 200, res.body?.error ?? "login failed");
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, "owner");
    assert.equal(res.body.user.customerCode, "TOMS001");
  });

  it("successful login can access dashboard (post-redirect target)", async () => {
    const login = await customerLogin("toms001.owner");
    const token = login.body.token as string;
    const dash = await request(app)
      .get("/api/customer/TOMS001/dashboard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(dash.status, 200);
    assert.equal(dash.body.customer.customerName, "トムズ設備デモ");
  });

  it("PWA shell supports hiding topbar when logged out", async () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-pwa-shell.js"), "utf8");
    assert.match(js, /export function setPwaTopbarVisible/);
  });

  it("hub cards expose portal, PRO Remote, install, maintenance links", async () => {
    const html = fs.readFileSync(path.join(publicDir, "customer-portal.html"), "utf8");
    const js = fs.readFileSync(path.join(publicDir, "js/customer-portal.js"), "utf8");
    assert.match(html, /card-pro-remote/);
    assert.match(html, /card-maintenance/);
    assert.match(js, /\/pro-remote/);
    assert.match(js, /\/install\/home/);
    assert.match(js, /\/maintenance/);
  });
});

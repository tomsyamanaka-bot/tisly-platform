import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { hashPassword } from "../src/auth/password.js";

process.env.JWT_SECRET = "test-phase2081-secret-32chars-ok!!";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-phase2081-2120.db";
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

describe("Phase 2081-2120 customer portal login flow", () => {
  before(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  after(() => closeDatabase());

  it("GET /customer/TOMS001 serves login form when unauthenticated", async () => {
    const res = await request(app).get("/customer/TOMS001");
    assert.equal(res.status, 200);
    assert.match(res.text, /顧客ログイン/);
    assert.match(res.text, /login-customer-code/);
    assert.match(res.text, /login-username/);
    assert.match(res.text, /login-password/);
    assert.match(res.text, /toms001\.owner/);
    assert.match(res.text, /demo-remote-2026/);
    assert.match(res.text, /portal-hub-cards/);
    assert.match(res.text, /btn-logout/);
  });

  it("toms001.owner / demo-remote-2026 login succeeds", async () => {
    const res = await customerLogin("toms001.owner");
    assert.equal(res.status, 200, res.body?.error ?? "login failed");
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, "owner");
    assert.equal(res.body.user.customerCode, "TOMS001");
  });

  it("dashboard returns TOMS001 customer portal data after login", async () => {
    const login = await customerLogin("toms001.owner");
    const token = login.body.token as string;
    const res = await request(app)
      .get("/api/customer/TOMS001/dashboard")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.customer.customerName, "トムズ設備デモ");
    assert.equal(res.body.customer.plan, "PRO_REMOTE");
    assert.equal(res.body.contract.status, "active");
    assert.ok(res.body.cards.deviceCount >= 1);
  });

  it("portal hub cards and navigation links exist in HTML", async () => {
    const html = fs.readFileSync(path.join(publicDir, "customer-portal.html"), "utf8");
    const js = fs.readFileSync(path.join(publicDir, "js/customer-portal.js"), "utf8");
    assert.match(html, /portal-hub-cards/);
    assert.match(html, /card-pro-remote/);
    assert.match(html, /card-maintenance/);
    assert.match(html, /card-billing/);
    assert.match(js, /card-pro-remote/);
    assert.match(js, /\/pro-remote/);
    assert.match(js, /\/maintenance/);
  });

  it("GET /customer/TOMS001/pro-remote serves PRO Remote with portal back link", async () => {
    const res = await request(app).get("/customer/TOMS001/pro-remote");
    assert.equal(res.status, 200);
    assert.match(res.text, /PRO Remote/);
    assert.match(res.text, /link-back-portal/);
    const js = fs.readFileSync(path.join(publicDir, "js/pro-remote-pwa.js"), "utf8");
    assert.match(js, /requireCustomerLogin/);
    assert.match(js, /link-back-portal/);
  });

  it("GET /customer/TOMS001/maintenance serves maintenance PWA route", async () => {
    const res = await request(app).get("/customer/TOMS001/maintenance");
    assert.equal(res.status, 200);
    assert.match(res.text, /保守 PWA/);
    assert.match(res.text, /点検予定/);
    assert.match(res.text, /Shelly再起動/);
    assert.match(res.text, /link-back-portal/);
  });

  it("GET /customer/TOMS001/install/home has install auth gate", async () => {
    const res = await request(app).get("/customer/TOMS001/install/home");
    assert.equal(res.status, 200);
    assert.match(res.text, /施工 PWA/);
    assert.match(res.text, /install-login-gate/);
    assert.match(res.text, /顧客ポータルへ戻る/);
  });

  it("logout clears token client-side pattern in portal JS", async () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-portal.js"), "utf8");
    assert.match(js, /clearCustomerToken/);
    assert.match(js, /btn-logout/);
  });

  it("iPhone 390px form inputs have touch-friendly CSS", async () => {
    const css = fs.readFileSync(path.join(publicDir, "css/customer-portal.css"), "utf8");
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /font-size:\s*16px/);
    assert.match(css, /safe-area-inset-bottom/);
    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /max-width:\s*100vw/);
    assert.match(css, /\.login-field input/);
  });

  it("customer-auth.js syncs localStorage and sessionStorage tokens", async () => {
    const js = fs.readFileSync(path.join(publicDir, "js/customer-auth.js"), "utf8");
    assert.match(js, /tisly_admin_token/);
    assert.match(js, /tisly_token/);
    assert.match(js, /requireCustomerLogin/);
    assert.match(js, /requireInstallAccess/);
  });
});

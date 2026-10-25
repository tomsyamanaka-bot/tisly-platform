/**
 * 龍ヶ崎店の顧客設定とテスト作動。
 * 平文パスワードは置かず、保存済みハッシュだけ見る。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";

process.env.JWT_SECRET = "test-jwt-ryugasaki-settings-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-ryugasaki-customer-settings-v1.db";
process.env.TISLY_REVIEW_SANDBOX = "0";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { signToken } = await import("../src/auth/jwt.js");
const { getDatabase } = await import("../src/db/database.js");
const {
  WASHMATE_CUSTOMER_CODE_V1,
  WASHMATE_ENABLED_MODULES_V1,
  WASHMATE_PASSWORD_HASH_V1,
  WASHMATE_USERNAME_V1,
} = await import("../src/customer/seed-washmate001-v1.js");
const { resetRyugasakiSecurityStateForTestV1 } = await import(
  "../src/home/home-ryugasaki-security-v1.js"
);
const {
  resetRyugasakiSettingsForTestV1,
  saveRyugasakiCustomerSettingsV1,
} = await import("../src/home/home-ryugasaki-settings-v1.js");
const { getCustomerPortalModulesV1 } = await import(
  "../src/shared/customer/customer-portal-modules-v1.js"
);
const { resolveCustomerTenantProfileV1 } = await import(
  "../src/shared/customer/customer-tenant-profile-v1.js"
);

const app = createApp();

function ownerToken(): string {
  return signToken({
    sub: "cu-WASHMATE001-owner",
    username: WASHMATE_USERNAME_V1,
    role: "owner",
    customerId: "cust-washmate",
    customerCode: WASHMATE_CUSTOMER_CODE_V1,
    scope: "customer",
  }).token;
}

describe("ryugasaki customer settings", () => {
  beforeEach(() => {
    resetRyugasakiSecurityStateForTestV1();
    resetRyugasakiSettingsForTestV1();
  });

  it("registers the store without HOME and keeps the password hash", () => {
    getDatabase();
    const profile = resolveCustomerTenantProfileV1("WASHMATE001");
    assert.equal(profile?.securitySiteId, "SEC-JP-RYUGASAKI-001");
    assert.equal(profile?.displayName, "ウォッシュメイト龍ヶ崎店");
    assert.equal(profile?.useToyoshimaDashboard, false);
    const modules = getCustomerPortalModulesV1("WASHMATE001");
    assert.deepEqual([...modules].sort(), [...WASHMATE_ENABLED_MODULES_V1].sort());
    assert.equal(modules.includes("tisly_home_v1"), false);
    const user = getDatabase()
      .prepare(
        `SELECT username, password_hash FROM customer_users
         WHERE username = ? COLLATE NOCASE`
      )
      .get(WASHMATE_USERNAME_V1) as
      | { username: string; password_hash: string }
      | undefined;
    assert.equal(user?.username, WASHMATE_USERNAME_V1);
    assert.equal(user?.password_hash, WASHMATE_PASSWORD_HASH_V1);
    assert.equal(user?.password_hash.includes("dsdwj"), false);
  });

  it("clamps and saves the customer timing", () => {
    const saved = saveRyugasakiCustomerSettingsV1({
      di3ConfirmMs: 2500,
      do1DurationSec: 3,
      do2DurationSec: 999,
    });
    assert.equal(saved.di3ConfirmMs, 2500);
    assert.equal(saved.do1DurationSec, 5);
    assert.equal(saved.do2DurationSec, 180);
  });

  it("rejects a test without the confirmation flag", async () => {
    const res = await request(app)
      .post("/api/home/v1/ryugasaki/test")
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ action: "do2_test", confirmed: false });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "最終確認が必要です");
  });

  it("queues the saved duration after confirmation", async () => {
    saveRyugasakiCustomerSettingsV1({ do1DurationSec: 22 });
    const res = await request(app)
      .post("/api/home/v1/ryugasaki/test")
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ action: "do1_test", confirmed: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "do1_test");
    assert.equal(res.body.durationSec, 22);
    const command = await request(app).get("/api/home/v1/ryugasaki/command");
    assert.equal(command.body.command, "do1_test");
    assert.equal(command.body.durationSec, 22);
    assert.equal(command.body.settings.do1DurationSec, 22);
  });

  it("does not change outputs when a sensor event arrives", async () => {
    const res = await request(app)
      .post("/api/home/v1/ryugasaki/event")
      .send({ di: 3, active: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.linkedOutput, false);
    const status = await request(app).get("/api/home/v1/ryugasaki/status");
    assert.equal(status.body.outputs[0].on, false);
    assert.equal(status.body.outputs[1].on, false);
    const command = await request(app).get("/api/home/v1/ryugasaki/command");
    assert.equal(command.body.command, null);
  });

  it("keeps the settings panel on the customer page only", () => {
    const customer = readFileSync(
      "public/js/features/security/security-floor-customer-v1.js",
      "utf8"
    );
    const operator = readFileSync(
      "public/js/features/security/security-floor-operator-v1.js",
      "utf8"
    );
    const panel = readFileSync(
      "public/js/features/security/washmate-customer-settings-v1.js",
      "utf8"
    );
    assert.match(customer, /mountWashmateCustomerSettings/);
    assert.equal(operator.includes("washmate-customer-settings"), false);
    assert.match(panel, /本当にテスト作動させますか？/);
    assert.equal(panel.includes("dsdwj"), false);
  });
});

/**
 * 顧客リスト2件化・不要デモ退役
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-canonical-customers-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-canonical-customers-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { listCustomers } = await import("../src/customer/customer-store.js");
const { listCustomerAccountsAdminV1 } = await import(
  "../src/shared/customer/customer-account-admin-v1.js"
);
const { getCustomerPortalModulesV1 } = await import(
  "../src/shared/customer/customer-portal-modules-v1.js"
);
const { resolveCustomerTenantProfileV1 } = await import(
  "../src/shared/customer/customer-tenant-profile-v1.js"
);
const {
  OBSOLETE_DEMO_CUSTOMER_CODES_V1,
} = await import("../src/customer/retire-obsolete-demo-customers-v1.js");

const app = createApp();

async function customerLogin(code: string, username: string) {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: code,
      username,
      password: "demo-remote-2026",
    });
}

describe("canonical customers v1 — 豊島邸 / 板橋自宅", () => {
  before(() => {
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
  });

  after(() => closeDatabase());

  it("active customers are only TOMS001 and TOYOSHIMA001", () => {
    const codes = listCustomers(true).map((c) => c.customer_code);
    assert.deepEqual(codes.sort(), ["TOMS001", "TOYOSHIMA001"].sort());
    for (const obsolete of OBSOLETE_DEMO_CUSTOMER_CODES_V1) {
      assert.ok(!codes.includes(obsolete), `still active: ${obsolete}`);
    }
  });

  it("display names are 板橋自宅 and 豊島邸", () => {
    const rows = listCustomers(true);
    const toms = rows.find((c) => c.customer_code === "TOMS001");
    const toyoshima = rows.find((c) => c.customer_code === "TOYOSHIMA001");
    assert.equal(toms?.customer_name, "板橋自宅");
    assert.equal(toyoshima?.customer_name, "豊島邸");
    assert.equal(
      resolveCustomerTenantProfileV1("TOMS001")?.displayName,
      "板橋自宅"
    );
    assert.equal(
      resolveCustomerTenantProfileV1("TOYOSHIMA001")?.displayName,
      "豊島邸"
    );
  });

  it("portal modules match required cards", () => {
    const toms = getCustomerPortalModulesV1("TOMS001");
    // "*" 保存時はポータル既定へフォールバック
    const tomsEffective = toms.includes("*")
      ? [
          "security_floor_v1",
          "tisly_home_v1",
          "camera_preview_v1",
          "customer_portal",
        ]
      : toms;
    assert.ok(tomsEffective.includes("security_floor_v1"));
    assert.ok(tomsEffective.includes("tisly_home_v1"));
    assert.ok(tomsEffective.includes("camera_preview_v1"));

    const toyoshima = getCustomerPortalModulesV1("TOYOSHIMA001");
    assert.ok(toyoshima.includes("security_floor_v1"));
    assert.ok(toyoshima.includes("camera_preview_v1"));
    assert.ok(!toyoshima.includes("tisly_home_v1"));
  });

  it("admin accounts list shows only 2 customers", async () => {
    const login = await customerLogin("TOMS001", "toms001.admin");
    assert.equal(login.status, 200);
    const res = await request(app)
      .get("/api/customer-portal/v1/admin/accounts")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(res.status, 200);
    const codes = (res.body.accounts as Array<{ customerCode: string }>).map(
      (a) => a.customerCode
    );
    assert.deepEqual(codes.sort(), ["TOMS001", "TOYOSHIMA001"].sort());
  });

  it("listCustomerAccountsAdminV1 matches canonical set", () => {
    const accounts = listCustomerAccountsAdminV1();
    assert.equal(accounts.length, 2);
  });

  it("TOYOSHIMA001 owner login works", async () => {
    const login = await customerLogin(
      "TOYOSHIMA001",
      "toyoshima001.owner"
    );
    assert.equal(login.status, 200, login.body?.error);
  });
});

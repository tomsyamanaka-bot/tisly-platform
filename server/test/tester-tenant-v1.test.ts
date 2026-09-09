/**
 * テスター専用テナント TESTER001
 * 板橋自宅実機連動とメニュー制限
 */
import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = "test-jwt-tester-tenant-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.TESTER001_PASSWORD = "tisly-test-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tester-tenant-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.REDIS_URL = "";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { resetRateLimitsForTests } = await import(
  "../src/security/rate-limit.js"
);
const { listCustomers, getCustomerByCode } = await import(
  "../src/customer/customer-store.js"
);
const { resolveCustomerTenantProfileV1 } = await import(
  "../src/shared/customer/customer-tenant-profile-v1.js"
);
const { getCustomerTenantBindingsV1 } = await import(
  "../src/shared/customer/customer-tenant-bindings-v1.js"
);
const { getEnabledModulesForCustomerV1 } = await import(
  "../src/tenant/customer-enabled-modules-store-v1.js"
);
const { getCustomerPortalModulesV1 } = await import(
  "../src/shared/customer/customer-portal-modules-v1.js"
);
const { buildCustomerSessionHomeV1 } = await import(
  "../src/shared/customer/customer-portal-data-v1.js"
);
const { listCustomerAccountsAdminV1 } = await import(
  "../src/shared/customer/customer-account-admin-v1.js"
);
const { isObsoleteDemoCustomerCodeV1 } = await import(
  "../src/customer/retire-obsolete-demo-customers-v1.js"
);
const {
  TESTER_CUSTOMER_CODE_V1,
  TESTER_HOME_SITE_ID_V1,
  TESTER_RP2350_MAIN_ID_V1,
  TESTER_SECURITY_SITE_ID_V1,
  isTesterTenantV1,
} = await import("../src/shared/customer/tester-tenant-v1.js");
const { listTenantScopedSecuritySitesV1 } = await import(
  "../src/shared/customer/customer-security-sites-v1.js"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const app = createApp();

describe("tester tenant TESTER001 / Itabashi live", () => {
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
    resetRateLimitsForTests();
    getDatabase();
  });

  after(() => closeDatabase());

  it("does not retire TESTER001 as obsolete demo", () => {
    assert.equal(isObsoleteDemoCustomerCodeV1("TESTER001"), false);
    assert.equal(isTesterTenantV1("TESTER001"), true);
    assert.equal(isTesterTenantV1("TOMS001"), false);
  });

  it("keeps canonical customers intact", () => {
    const codes = listCustomers(true).map((c) => c.customer_code);
    assert.ok(codes.includes("TOMS001"));
    assert.ok(codes.includes("TOYOSHIMA001"));
    assert.ok(codes.includes("TESTER001"));
    assert.equal(getCustomerByCode("TOMS001")?.customer_name, "板橋自宅");
    assert.equal(getCustomerByCode("TOYOSHIMA001")?.customer_name, "豊島邸");
  });

  it("hides tester from default admin account list", () => {
    const accounts = listCustomerAccountsAdminV1();
    const codes = accounts.map((a) => a.customerCode);
    assert.ok(codes.includes("TOMS001"));
    assert.ok(codes.includes("TOYOSHIMA001"));
    assert.ok(!codes.includes("TESTER001"));
  });

  it("maps TESTER001 to Itabashi live RP2350", () => {
    const profile = resolveCustomerTenantProfileV1("TESTER001");
    assert.ok(profile);
    assert.equal(profile?.homeSiteId, TESTER_HOME_SITE_ID_V1);
    assert.equal(profile?.securitySiteId, TESTER_SECURITY_SITE_ID_V1);
    assert.equal(profile?.useToyoshimaDashboard, false);
    const bindings = getCustomerTenantBindingsV1("TESTER001");
    assert.equal(bindings.rp2350MainId, TESTER_RP2350_MAIN_ID_V1);
    const sites = listTenantScopedSecuritySitesV1("TESTER001");
    assert.equal(sites.length, 1);
    assert.equal(sites[0]?.siteId, "SEC-JP-ITABASHI-LIVE");
    assert.equal(sites[0]?.homeSiteId, "HOME-JP-ITABASHI-LIVE");
  });

  it("limits tester modules (no estimate / 3D / business)", () => {
    const mods = getEnabledModulesForCustomerV1("TESTER001");
    assert.ok(mods.includes("security_floor_v1"));
    assert.ok(mods.includes("tisly_home_v1"));
    assert.ok(!mods.includes("*"));
    assert.ok(!mods.includes("estimate_v1"));
    assert.ok(!mods.includes("print_generator_v1"));
    assert.ok(!mods.includes("print_model_viewer_v1"));
    assert.ok(!mods.includes("floorplan_builder_v1"));
    assert.ok(!mods.includes("knowledge_module_v1"));
    const portal = getCustomerPortalModulesV1("TESTER001");
    assert.ok(portal.includes("security_floor_v1"));
    assert.ok(!portal.includes("estimate_v1"));
  });

  it("session home cards are security dashboard only", () => {
    const home = buildCustomerSessionHomeV1("TESTER001");
    const ids = home.cards.map((c) => c.id);
    assert.ok(ids.includes("home_security"));
    assert.ok(ids.includes("tisly_home"));
    assert.ok(!ids.includes("documents"));
    assert.ok(!ids.includes("eco_water"));
    assert.ok(!ids.includes("gas_monitor"));
    const labels = home.cards.map((c) => c.label).join(" ");
    assert.doesNotMatch(labels, /見積/);
    assert.doesNotMatch(labels, /事業内容/);
    assert.doesNotMatch(labels, /3Dプリン/);
  });

  it("logs in with tester.user / tisly-test-2026", async () => {
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: TESTER_CUSTOMER_CODE_V1,
        username: "tester.user",
        password: "tisly-test-2026",
      });
    assert.equal(login.status, 200, login.body?.error);
    assert.equal(login.body.user?.customerCode, "TESTER001");
    assert.equal(login.body.scope, "customer");

    const session = await request(app)
      .get("/api/customer-portal/v1/session-home")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(session.status, 200);
    assert.equal(session.body.tenantProfile.homeSiteId, "HOME-JP-ITABASHI-LIVE");
    assert.equal(
      session.body.tenantProfile.securitySiteId,
      "SEC-JP-ITABASHI-LIVE"
    );
    const ids = (session.body.home?.cards || []).map(
      (c: { id: string }) => c.id
    );
    assert.ok(ids.includes("home_security"));
    assert.ok(!ids.includes("documents"));

    const sites = await request(app)
      .get("/api/security-floor/v1/customer-sites")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(sites.status, 200);
    assert.equal(sites.body.sites.length, 1);
    assert.equal(sites.body.sites[0].siteId, "SEC-JP-ITABASHI-LIVE");

    const hub = await request(app)
      .get("/api/pwa/hub")
      .set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(hub.status, 200);
    const hubIds = (hub.body.practicalApps || []).map(
      (a: { id: string }) => a.id
    );
    assert.ok(hubIds.includes("security_floor_v1"));
    assert.ok(hubIds.includes("tisly_home_v1"));
    assert.ok(!hubIds.includes("estimate_v1"));
    assert.ok(!hubIds.includes("print_generator_v1"));
    assert.equal(hub.body.showOpsPanels, false);
  });

  it("customer UI assets hide estimate and 3D printer labels", () => {
    const html = fs.readFileSync(
      path.join(serverRoot, "public/customer-v1.html"),
      "utf8"
    );
    const js = fs.readFileSync(
      path.join(serverRoot, "public/js/customer-v1.js"),
      "utf8"
    );
    const filterJs = fs.readFileSync(
      path.join(serverRoot, "public/js/customer-tester-push-v1.js"),
      "utf8"
    );
    assert.ok(html.includes("/customer"));
    assert.ok(js.includes("filterTesterHomeCards"));
    assert.match(filterJs, /見積/);
    assert.match(filterJs, /3Dプリン/);
    assert.match(filterJs, /HOME-JP-ITABASHI-LIVE/);
  });

  it("does not overwrite Itabashi or Toyoshima names", () => {
    assert.equal(
      resolveCustomerTenantProfileV1("TOMS001")?.displayName,
      "板橋自宅"
    );
    assert.equal(
      resolveCustomerTenantProfileV1("TOYOSHIMA001")?.displayName,
      "豊島邸"
    );
    assert.equal(
      getCustomerTenantBindingsV1("TOMS001").rp2350MainId,
      "rp2350-itabashi-main-01"
    );
    assert.equal(
      getCustomerTenantBindingsV1("TOYOSHIMA001").rp2350MainId,
      "rp2350-toyoshima-main-01"
    );
  });
});

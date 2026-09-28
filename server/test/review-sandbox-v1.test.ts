/**
 * クローズドテスト: 未ログインは実機一覧と実機操作から外す
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  getRemoteTestStatus,
  resetRemoteTestState,
} from "../src/remote-test/remote-test-state.js";
import { findHomeSiteV1 } from "../src/home/home-sites-v1.js";
import { normalizeLoginCustomerCodeV1 } from "../src/shared/customer/tester-tenant-v1.js";

const app = createApp();
const LIVE = "HOME-JP-ITABASHI-LIVE";
const DEMO = "HOME-JP-TSUKUBA-001";

describe("review sandbox v1", () => {
  const previous = process.env.TISLY_REVIEW_SANDBOX;

  before(() => {
    process.env.TISLY_REVIEW_SANDBOX = "1";
  });

  after(() => {
    if (previous === undefined) delete process.env.TISLY_REVIEW_SANDBOX;
    else process.env.TISLY_REVIEW_SANDBOX = previous;
  });

  it("normalizes fullwidth tester codes", () => {
    assert.equal(normalizeLoginCustomerCodeV1("ＴＥＳＴＥＲ００１"), "TESTER001");
    assert.equal(normalizeLoginCustomerCodeV1("tester-001"), "TESTER001");
  });

  it("logs in TESTER001 from fullwidth code and from username", async () => {
    const wide = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "ＴＥＳＴＥＲ００１",
        username: "someone",
        password: "tisly-test-2026",
      });
    assert.equal(wide.status, 200, JSON.stringify(wide.body));
    assert.equal(wide.body.token, "tester-token-2026");
    assert.equal(wide.body.customerCode, "TESTER001");

    const byUser = await request(app)
      .post("/api/auth/customer/login")
      .send({
        customerCode: "NOT-A-CODE",
        username: "tester.user",
        password: "anything",
      });
    assert.equal(byUser.status, 200, JSON.stringify(byUser.body));
    assert.equal(byUser.body.tenantId, "TESTER001");
  });

  it("hides live homes from the anonymous quick switch", async () => {
    const quick = await request(app).get("/api/home/v1/quick-switch");
    assert.equal(quick.status, 200);
    assert.equal(quick.body.reviewSandbox, true);
    const ids = quick.body.items.map((item) => item.siteId);
    assert.ok(ids.length >= 1);
    assert.ok(!ids.includes(LIVE));
    assert.ok(!ids.includes("HOME-JP-TOYOSHIMA"));
    assert.ok(ids.includes(DEMO));
  });

  it("does not queue a live lock or relay for an anonymous tester", async () => {
    resetRemoteTestState();
    const before = findHomeSiteV1(LIVE).lock.locked;
    const control = await request(app).post("/api/home/v1/control").send({
      siteId: LIVE,
      target: "lock",
      action: "unlock",
      actor: "coconala-tester",
    });
    assert.equal(control.status, 200);
    assert.equal(control.body.reviewSandbox, true);
    assert.equal(control.body.hardwareMock, true);
    assert.equal(findHomeSiteV1(LIVE).lock.locked, before);
    assert.equal(getRemoteTestStatus().pendingCommand, null);

    const pulse = await request(app)
      .post("/api/devices/rp2350/relay/1/pulse")
      .send({ durationMs: 1000, reason: "smart_intercom_unlock" });
    assert.equal(pulse.status, 200);
    assert.equal(pulse.body.reviewSandbox, true);
    assert.equal(getRemoteTestStatus().pendingCommand, null);
  });

  it("still controls a demo home without a session", async () => {
    const res = await request(app).post("/api/home/v1/control").send({
      siteId: DEMO,
      target: "aircon",
      action: "power",
      deviceKey: findHomeSiteV1(DEMO).aircons[0].deviceKey,
      value: findHomeSiteV1(DEMO).aircons[0].power,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.notEqual(res.body.reviewSandbox, true);
  });

  it("lists demo security sites instead of live houses", async () => {
    const sites = await request(app).get("/api/security-floor/v1/operator-sites");
    assert.equal(sites.status, 200);
    assert.equal(sites.body.reviewSandbox, true);
    const ids = sites.body.sites.map((site) => site.siteId);
    assert.ok(ids.includes("SEC-JP-MORIYA-001"));
    assert.ok(!ids.includes("SEC-JP-ITABASHI-LIVE"));
    assert.ok(!ids.includes("SEC-JP-TOYOSHIMA-001"));
  });
});

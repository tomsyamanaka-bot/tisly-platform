import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TISLY_HEARTBEAT_INTERVAL_SEC_V1,
  TISLY_HEARTBEAT_OFFLINE_MS_V1,
  buildHeartbeatCommLossPushBodyV1,
  buildHeartbeatCommLossPushTitleV1,
  isHeartbeatOnlineV1,
} from "../src/home/home-heartbeat-standard-v1.js";
import {
  TOYOSHIMA_HEARTBEAT_INTERVAL_SEC_V1,
  TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1,
} from "../src/home/home-toyoshima-security-v1.js";
import {
  applyCustomerSiteProfileCloneV1,
  buildCustomerSiteProfileCloneV1,
} from "../src/shared/customer/customer-site-profile-clone-v1.js";
import { resolveCustomerTenantProfileV1 } from "../src/shared/customer/customer-tenant-profile-v1.js";

describe("home-heartbeat-standard-v1", () => {
  it("uses 300s interval and 5m30s offline window", () => {
    assert.equal(TISLY_HEARTBEAT_INTERVAL_SEC_V1, 300);
    assert.equal(TISLY_HEARTBEAT_OFFLINE_MS_V1, 330_000);
    assert.equal(
      TOYOSHIMA_HEARTBEAT_INTERVAL_SEC_V1,
      TISLY_HEARTBEAT_INTERVAL_SEC_V1
    );
    assert.equal(
      TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1,
      TISLY_HEARTBEAT_OFFLINE_MS_V1
    );
  });

  it("detects online/offline around the grace window", () => {
    const now = Date.UTC(2026, 8, 7, 6, 0, 0);
    const fresh = new Date(now - 60_000).toISOString();
    const stale = new Date(now - 331_000).toISOString();
    assert.equal(isHeartbeatOnlineV1(fresh, now), true);
    assert.equal(isHeartbeatOnlineV1(stale, now), false);
    assert.equal(isHeartbeatOnlineV1(null, now), false);
  });

  it("builds emergency push copy", () => {
    const title = buildHeartbeatCommLossPushTitleV1({
      siteDisplayName: "豊島邸",
      deviceLabel: "主装置",
    });
    const body = buildHeartbeatCommLossPushBodyV1({
      deviceLabel: "主装置",
    });
    assert.match(title, /【緊急】/);
    assert.match(title, /豊島邸/);
    assert.match(title, /主装置との通信が途絶えました/);
    assert.match(body, /5分以上ハートビート未受信/);
  });
});

describe("customer-site-profile-clone-v1", () => {
  it("clones Toyoshima blueprint with diffs", () => {
    const byName = buildCustomerSiteProfileCloneV1({
      sourceCustomerCode: "豊島邸",
      newCustomerCode: "SATO001",
      newDisplayName: "佐藤邸",
      diffs: {
        lightingDurationSec: 45,
        di1Label: "玄関センサー",
      },
    });
    assert.equal(byName.ok, true);
    if (!byName.ok) return;
    assert.equal(byName.sourceCustomerCode, "TOYOSHIMA001");
    assert.equal(byName.profile.customerCode, "SATO001");
    assert.equal(byName.profile.displayName, "佐藤邸");
    assert.equal(byName.profile.useToyoshimaDashboard, true);
    assert.equal(byName.deviceBlueprint.defaultLightingDurationSec, 45);
    assert.equal(byName.deviceBlueprint.defaultDi1Label, "玄関センサー");
    assert.equal(byName.deviceBlueprint.hasDetached, true);
    assert.equal(byName.deviceBlueprint.modbusSlaveId, 1);
    assert.match(byName.customerDevicesMarkdownAppend, /佐藤邸/);
    assert.match(byName.initialLogin.username, /sato001\.owner/i);
  });

  it("applies clone into runtime profile without touching static", () => {
    const code = `CLONE${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const applied = applyCustomerSiteProfileCloneV1({
      sourceCustomerCode: "TOMS001",
      newCustomerCode: code,
      newDisplayName: "試験邸",
      diffs: { lightingDurationSec: 60 },
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const resolved = resolveCustomerTenantProfileV1(code);
    assert.ok(resolved);
    assert.equal(resolved!.displayName, "試験邸");
    assert.equal(resolved!.useToyoshimaDashboard, false);
    assert.equal(applied.deviceBlueprint.defaultLightingDurationSec, 60);
  });

  it("rejects cloning onto existing customer codes", () => {
    const bad = buildCustomerSiteProfileCloneV1({
      sourceCustomerCode: "TOYOSHIMA001",
      newCustomerCode: "TOMS001",
      newDisplayName: "重複邸",
    });
    assert.equal(bad.ok, false);
  });
});

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  applyCustomerSecurityModeV1,
  deriveCustomerSecurityModeV1,
  getCustomerSecurityModeV1,
} from "../src/home/home-customer-security-mode-v1.js";
import { getHomeSecurityRulesV1 } from "../src/home/home-security-rules-v1.js";
import { HOME_JP_TOYOSHIMA_SITE_ID_V1 } from "../src/home/home-toyoshima-security-v1.js";
import { captureSecurityAlarmSnapshotV1 } from "../src/home/home-security-alarm-snapshot-v1.js";
import {
  buildMonthlySecurityReportHtmlV1,
  buildMonthlySecurityReportV1,
} from "../src/home/home-monthly-security-report-v1.js";
import {
  buildToyoshimaSecurityDashboardV1,
  processToyoshimaSecurityEventV1,
  resetToyoshimaSecurityStateForTestV1,
} from "../src/home/home-toyoshima-security-v1.js";

describe("customer-security-mode-and-report-v1", () => {
  afterEach(() => {
    resetToyoshimaSecurityStateForTestV1();
    applyCustomerSecurityModeV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      mode: "home",
      actor: "test",
    });
  });

  it("applies away/home/disarmed modes to rules", () => {
    const away = applyCustomerSecurityModeV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      mode: "away",
    });
    assert.equal(away.mode, "away");
    assert.equal(away.rules.guardMode, "always");
    assert.equal(away.rules.customerSecurityMode, "away");

    const home = applyCustomerSecurityModeV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      mode: "home",
    });
    assert.equal(home.mode, "home");
    assert.equal(home.rules.guardMode, "scheduled");
    assert.equal(home.rules.notifyStagedMode, "off");

    const off = applyCustomerSecurityModeV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      mode: "disarmed",
    });
    assert.equal(off.mode, "disarmed");
    assert.equal(off.rules.guardMode, "off");
  });

  it("dashboard exposes customerMode Japanese label", () => {
    applyCustomerSecurityModeV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      mode: "away",
    });
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.equal(dash.customerMode, "away");
    assert.equal(dash.customerModeLabel, "おでかけ警戒");
  });

  it("alarm events attach camera snapshots", async () => {
    applyCustomerSecurityModeV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      mode: "away",
    });
    await processToyoshimaSecurityEventV1({
      building: "detached",
      di: 1,
    });
    const dash = buildToyoshimaSecurityDashboardV1();
    const road = dash.timeline.find((t) => t.kind === "detached_road");
    assert.ok(road?.snapshot?.imageUrl);
    assert.match(road.snapshot.cameraLabel, /道路|はなれ/);
  });

  it("captures snapshot helper for main beam", () => {
    const snap = captureSecurityAlarmSnapshotV1({
      eventKind: "main_beam",
    });
    assert.ok(snap);
    assert.equal(snap?.cameraId, "cam-main-gate");
    assert.match(snap?.imageUrl || "", /^data:image\/svg\+xml/);
  });

  it("builds monthly report with Japanese labels", () => {
    const report = buildMonthlySecurityReportV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
    });
    assert.match(report.displayName, /豊島邸/);
    assert.match(report.detectionLabel, /件/);
    assert.match(report.uptimeLabel, /オンライン/);
    const html = buildMonthlySecurityReportHtmlV1(report);
    assert.match(html, /月次セキュリティ安心レポート/);
    assert.match(html, /月次/);
  });

  it("getCustomerSecurityMode returns options", () => {
    const cur = getCustomerSecurityModeV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.ok(cur.options.length >= 3);
    assert.ok(
      ["away", "home", "disarmed"].includes(
        deriveCustomerSecurityModeV1(getHomeSecurityRulesV1(HOME_JP_TOYOSHIMA_SITE_ID_V1))
      )
    );
  });
});

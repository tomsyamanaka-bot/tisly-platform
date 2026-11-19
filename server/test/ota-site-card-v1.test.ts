import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOtaDeployRequestV1,
  buildOtaVersionRequestV1,
  formatFirmwareVersionLabel,
  formatOtaHeartbeatLabel,
  otaCardStatusText,
  resolveOtaSiteSlugV1,
} from "../public/js/features/security/ota-site-card-v1.js";

const SITES = [
  ["SEC-JP-ITABASHI-LIVE", "itabashi"],
  ["SEC-JP-TOYOSHIMA-001", "toyoshima"],
  ["SEC-JP-RYUGASAKI-001", "ryugasaki"],
  ["SEC-JP-KEEPRISING-001", "keeprising"],
] as const;

test("staff OTA slug follows the selected site", () => {
  for (const [siteId, slug] of SITES) {
    assert.equal(resolveOtaSiteSlugV1(siteId), slug);
    const version = buildOtaVersionRequestV1(slug, "production", 1700000000000);
    assert.equal(version.init.cache, "no-store");
    assert.match(version.url, new RegExp(`/api/firmware/${slug}/version`));
    assert.match(version.url, /channel=production/);
    assert.match(version.url, /t=1700000000000/);
    const plan = buildOtaDeployRequestV1({
      siteId,
      channel: "production",
      allSites: false,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) continue;
    assert.equal(plan.slug, slug);
    assert.equal(plan.body.siteId, siteId);
    assert.equal(plan.body.currentSiteId, siteId);
    assert.equal(plan.body.allSites, false);
    assert.equal("force" in plan.body, false);
    assert.equal(plan.url, `/api/firmware/${slug}/deploy`);
  }
});

test("unknown site is not deployed to Itabashi", () => {
  assert.equal(resolveOtaSiteSlugV1("SEC-JP-FUTURE-009"), "");
  assert.equal(resolveOtaSiteSlugV1(""), "");
  const plan = buildOtaDeployRequestV1({
    siteId: "SEC-JP-FUTURE-009",
    channel: "production",
    allSites: false,
  });
  assert.equal(plan.ok, false);
  const toyoshima = buildOtaDeployRequestV1({
    siteId: "SEC-JP-TOYOSHIMA-001",
    allSites: false,
  });
  assert.equal(toyoshima.ok, true);
  if (toyoshima.ok) {
    assert.equal(toyoshima.slug, "toyoshima");
    assert.doesNotMatch(toyoshima.url, /itabashi/);
  }
});

test("OTA card text uses the reported version and heartbeat", () => {
  assert.equal(formatFirmwareVersionLabel("1.2.63"), "1.2.63");
  assert.equal(formatFirmwareVersionLabel("v1.6.1-wdt"), "v1.6.1-wdt");
  assert.equal(formatFirmwareVersionLabel(null), "未受信");
  assert.equal(otaCardStatusText({ has_ota_update: true }), "更新待機中");
  assert.equal(otaCardStatusText({ update_required: true }), "更新待機中");
  assert.equal(otaCardStatusText({ pending: true }), "最新適用済み");
  assert.equal(otaCardStatusText({}), "最新適用済み");
  const label = formatOtaHeartbeatLabel("2026-11-19T00:53:11.347Z");
  assert.match(label, /2026/);
  assert.match(label, /09:53:11/);
});

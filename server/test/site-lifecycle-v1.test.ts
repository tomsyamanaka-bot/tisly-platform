import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { classifySiteSignalV1 } from "../src/home/site-signal-board-v1.js";
import {
  addSiteUnitV1,
  deleteSiteLifecycleV1,
  deleteSiteUnitV1,
  listSiteLifecyclesV1,
  resetSiteLifecycleForTestV1,
  setSiteLifecycleV1,
  setUnitPresenceV1,
  siteAllowsLiveWatchV1,
  siteLifecycleOfV1,
  unitAllowsLiveWatchV1,
  watchedHeartbeatSlotsV1,
} from "../src/home/site-lifecycle-v1.js";

after(() => {
  resetSiteLifecycleForTestV1();
});

describe("site lifecycle", () => {
  it("keeps Toyoshima online when the annex is not installed", () => {
    resetSiteLifecycleForTestV1();
    const site = siteLifecycleOfV1("HOME-JP-TOYOSHIMA");
    const annex = site?.units.find((unit) => unit.id === "detached");
    assert.equal(annex?.presence, "planned");
    const link = watchedHeartbeatSlotsV1(
      [
        { presence: "active", at: new Date().toISOString() },
        { presence: "planned", at: null },
      ],
      Date.now()
    );
    assert.equal(link.offline, false);
    const row = classifySiteSignalV1({
      offline: link.offline,
      offlineAgeMs: link.ageMs,
      maintenance: false,
      maintenanceRemainingMin: null,
      cabinetTempC: 26.7,
      wdtFrequent: false,
      sensorFlood: false,
      firmwareMismatch: false,
    });
    assert.equal(row.healthLevel, "ok");
    assert.equal(row.statusLabel, "オンライン");
    assert.equal(unitAllowsLiveWatchV1("HOME-JP-TOYOSHIMA", "detached"), false);
    assert.equal(unitAllowsLiveWatchV1("HOME-JP-TOYOSHIMA", "main"), true);
  });

  it("keeps demo and archived sites out of live alerts", () => {
    resetSiteLifecycleForTestV1();
    assert.equal(siteLifecycleOfV1("HOME-JP-RYUGASAKI")?.lifecycleStatus, "archived");
    assert.equal(siteLifecycleOfV1("HOME-JP-KEEPRISING")?.lifecycleStatus, "demo");
    assert.equal(siteAllowsLiveWatchV1("HOME-JP-RYUGASAKI"), false);
    assert.equal(siteAllowsLiveWatchV1("HOME-JP-KEEPRISING"), false);
    assert.equal(siteAllowsLiveWatchV1("WASHMATE001"), false);
    const active = listSiteLifecyclesV1()
      .filter((site) => site.lifecycleStatus === "active")
      .map((site) => site.customerCode)
      .sort();
    assert.deepEqual(active, ["TOMS001", "TOYOSHIMA001"]);
  });

  it("persists units and refuses to delete an active site", () => {
    resetSiteLifecycleForTestV1();
    const blocked = deleteSiteLifecycleV1("HOME-JP-ITABASHI-LIVE", "削除");
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /アーカイブ/);

    const added = addSiteUnitV1("HOME-JP-TOYOSHIMA", {
      name: "第2倉庫",
      kind: "modbus",
      modbusId: "2",
      presence: "planned",
    });
    assert.equal(added.ok, true);
    const unitId = added.site?.units.at(-1)?.id || "";
    const turned = setUnitPresenceV1("HOME-JP-TOYOSHIMA", unitId, "active");
    assert.equal(turned.ok, true);
    assert.equal(
      siteLifecycleOfV1("HOME-JP-TOYOSHIMA")?.units.find((unit) => unit.id === unitId)
        ?.presence,
      "active"
    );
    const parent = deleteSiteUnitV1("HOME-JP-TOYOSHIMA", "main");
    assert.equal(parent.ok, false);
    const removed = deleteSiteUnitV1("HOME-JP-TOYOSHIMA", unitId);
    assert.equal(removed.ok, true);
    assert.equal(
      siteLifecycleOfV1("HOME-JP-TOYOSHIMA")?.units.some((unit) => unit.id === unitId),
      false
    );

    const moved = setSiteLifecycleV1("HOME-JP-KEEPRISING", "archived");
    assert.equal(moved.ok, true);
    assert.equal(siteLifecycleOfV1("HOME-JP-KEEPRISING")?.lifecycleStatus, "archived");
    const gone = deleteSiteLifecycleV1("HOME-JP-KEEPRISING", "削除");
    assert.equal(gone.ok, true);
    assert.equal(
      listSiteLifecyclesV1().some((site) => site.siteId === "HOME-JP-KEEPRISING"),
      false
    );
    const demo = setSiteLifecycleV1("HOME-JP-RYUGASAKI", "demo");
    assert.equal(demo.site?.lifecycleStatus, "demo");
    const removedDemo = deleteSiteLifecycleV1("HOME-JP-RYUGASAKI", "削除");
    assert.equal(removedDemo.ok, true);
  });
});

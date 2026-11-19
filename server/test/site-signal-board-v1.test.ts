import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySiteSignalV1,
  sortSiteSignalsV1,
  type SiteSignalFactsV1,
} from "../src/home/site-signal-board-v1.js";

function facts(extra: Partial<SiteSignalFactsV1> = {}): SiteSignalFactsV1 {
  return {
    offline: false,
    offlineAgeMs: null,
    maintenance: false,
    maintenanceRemainingMin: null,
    cabinetTempC: 36,
    wdtFrequent: false,
    sensorFlood: false,
    firmwareMismatch: false,
    ...extra,
  };
}

describe("site signal board", () => {
  it("sorts critical, then warning, then ok", () => {
    const rows = sortSiteSignalsV1([
      { healthLevel: "ok" as const, displayName: "板橋自宅" },
      { healthLevel: "warning" as const, displayName: "龍ヶ崎" },
      { healthLevel: "critical" as const, displayName: "豊島邸" },
      { healthLevel: "ok" as const, displayName: "Keep Rising" },
    ]);
    assert.deepEqual(
      rows.map((row) => row.healthLevel),
      ["critical", "warning", "ok", "ok"]
    );
  });

  it("treats an offline site in maintenance as warning", () => {
    const row = classifySiteSignalV1(
      facts({
        offline: true,
        offlineAgeMs: 12 * 60_000,
        maintenance: true,
        maintenanceRemainingMin: 25,
      })
    );
    assert.equal(row.healthLevel, "warning");
    assert.match(row.statusLabel, /点検中 残り25分/);
  });

  it("marks 65C and frequent restarts as critical", () => {
    const hot = classifySiteSignalV1(facts({ cabinetTempC: 65 }));
    const warm = classifySiteSignalV1(facts({ cabinetTempC: 58.2 }));
    const wdt = classifySiteSignalV1(facts({ wdtFrequent: true }));
    const lost = classifySiteSignalV1(
      facts({ offline: true, offlineAgeMs: 12 * 60_000 })
    );
    assert.equal(hot.healthLevel, "critical");
    assert.match(hot.statusLabel, /65\.0/);
    assert.equal(warm.healthLevel, "warning");
    assert.match(warm.statusLabel, /高温注意 58\.2/);
    assert.equal(wdt.healthLevel, "critical");
    assert.equal(lost.healthLevel, "critical");
    assert.match(lost.statusLabel, /オフライン 12分/);
    const flood = classifySiteSignalV1(facts({ sensorFlood: true }));
    assert.equal(flood.healthLevel, "critical");
  });

  it("keeps a quiet site online", () => {
    const row = classifySiteSignalV1(facts());
    assert.equal(row.healthLevel, "ok");
    assert.equal(row.statusLabel, "オンライン");
  });
});

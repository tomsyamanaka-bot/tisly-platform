import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampMmwaveDwellSecV1,
  getItabashiMmwaveStatusV1,
  holdSecondsFromBodyV1,
  ingestItabashiMmwaveEventV1,
  mmwavePhaseLabelV1,
  saveItabashiMmwaveDwellSecV1,
  shouldPushMmwaveV1,
} from "../src/home/home-itabashi-mmwave-v1.js";

describe("itabashi mmwave gpio44", () => {
  it("defaults dwell to 3 seconds and clamps the range", () => {
    assert.equal(clampMmwaveDwellSecV1(undefined), 3);
    assert.equal(clampMmwaveDwellSecV1(5), 5);
    assert.equal(clampMmwaveDwellSecV1(0), 1);
    assert.equal(clampMmwaveDwellSecV1(900), 300);
  });

  it("labels the three visible states", () => {
    assert.equal(mmwavePhaseLabelV1("clear"), "🟢 クリア（待機中）");
    assert.equal(
      mmwavePhaseLabelV1("approach", 2, 10),
      "🟡 接近検知中（経過: 2秒 / 判定: 10秒）"
    );
    assert.equal(mmwavePhaseLabelV1("dwell"), "🚨 滞留警報発報中！");
  });

  it("cools down approach and dwell for 12 seconds", () => {
    assert.equal(shouldPushMmwaveV1("approach", 50_000, undefined), true);
    assert.equal(shouldPushMmwaveV1("approach", 20_000, 10_000), false);
    assert.equal(shouldPushMmwaveV1("approach", 22_000, 10_000), true);
    assert.equal(shouldPushMmwaveV1("dwell", 20_000, 10_000), false);
    assert.equal(shouldPushMmwaveV1("dwell", 22_000, 10_000), true);
  });

  it("reads mmwaveHoldSeconds before the older field", () => {
    assert.equal(
      holdSecondsFromBodyV1({ mmwaveHoldSeconds: 10, dwellSec: 5 }),
      10
    );
  });

  it("keeps a saved hold when a live sample arrives", async () => {
    const saved = saveItabashiMmwaveDwellSecV1(10, "TOMS001");
    assert.equal(saved.mmwaveHoldSeconds, 10);
    await ingestItabashiMmwaveEventV1({
      siteId: "HOME-JP-ITABASHI-LIVE",
      sensor_id: "mmwave_gpio44",
      event: "level",
      level: 1,
      heldMs: 1200,
    });
    const again = getItabashiMmwaveStatusV1("TOMS001");
    assert.equal(again.mmwaveHoldSeconds, 10);
    assert.equal(again.dwellSec, 10);
    assert.equal(again.phase, "approach");
  });

  it("stores a raw GPIO sample without changing the saved hold", async () => {
    const before = getItabashiMmwaveStatusV1("HOME-JP-ITABASHI-LIVE");
    await ingestItabashiMmwaveEventV1({
      siteId: "HOME-JP-ITABASHI-LIVE",
      sensor_id: "mmwave_gpio44",
      event: "sample",
      level: 0,
      gpio44Error: "",
      firmwareVersion: "1.6.15",
    });
    const after = getItabashiMmwaveStatusV1("HOME-JP-ITABASHI-LIVE");
    assert.equal(after.mmwaveHoldSeconds, before.mmwaveHoldSeconds);
    assert.equal(after.phase, before.phase);
    assert.equal(after.gpio44Level, 0);
    assert.equal(after.gpioRawLabel, "GPIO44 生入力値: LOW (0)");
    assert.equal(after.firmwareVersion, "1.6.15");
    assert.equal(after.firmwareLabel, "実機バージョン: v1.6.15");
  });
});

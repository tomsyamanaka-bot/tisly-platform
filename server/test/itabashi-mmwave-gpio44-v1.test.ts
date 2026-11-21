import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampMmwaveDwellSecV1,
  mmwavePhaseLabelV1,
  shouldPushMmwaveV1,
} from "../src/home/home-itabashi-mmwave-v1.js";

describe("itabashi mmwave gpio44", () => {
  it("defaults dwell to 5 seconds and clamps the range", () => {
    assert.equal(clampMmwaveDwellSecV1(undefined), 5);
    assert.equal(clampMmwaveDwellSecV1(5), 5);
    assert.equal(clampMmwaveDwellSecV1(0), 1);
    assert.equal(clampMmwaveDwellSecV1(900), 300);
  });

  it("labels the three visible states", () => {
    assert.equal(mmwavePhaseLabelV1("clear"), "🟢 クリア（待機中）");
    assert.equal(mmwavePhaseLabelV1("approach"), "🟡 接近検知");
    assert.equal(mmwavePhaseLabelV1("dwell"), "🚨 滞留検知中");
  });

  it("cools down approach and dwell separately", () => {
    assert.equal(shouldPushMmwaveV1("approach", 50_000, undefined), true);
    assert.equal(shouldPushMmwaveV1("approach", 50_000, 10_000), false);
    assert.equal(shouldPushMmwaveV1("approach", 55_000, 10_000), true);
    assert.equal(shouldPushMmwaveV1("dwell", 50_000, 10_000), false);
    assert.equal(shouldPushMmwaveV1("dwell", 70_000, 10_000), true);
  });
});

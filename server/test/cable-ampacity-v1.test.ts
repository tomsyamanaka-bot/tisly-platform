import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CABLE_AMPACITY_TABLE_V1,
  getCableAmpacityV1,
  validateCableInstallationV1,
  validateCableLoadV1,
} from "../src/electrical/cable-ampacity-v1.js";

describe("cable-ampacity-v1", () => {
  it("マスターテーブル件数", () => {
    assert.equal(CABLE_AMPACITY_TABLE_V1.length, 32);
  });

  it("VVF 2.0mm 3C 配管内許容電流", () => {
    assert.equal(getCableAmpacityV1("VVF-2.0-3C", "conduit"), 13);
  });

  it("DV 配管内は不可", () => {
    const result = validateCableInstallationV1("DV-2.0-3C", "conduit");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /使用できません/);
  });

  it("VCTF 天井裏露出は不可", () => {
    const result = validateCableInstallationV1("VCTF-VFF-2.0-3C", "ceiling_exposed");
    assert.equal(result.ok, false);
  });

  it("負荷超過を検出", () => {
    const result = validateCableLoadV1("VVF-1.6-2C", "conduit", 20);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /超過/);
  });

  it("許容範囲内の負荷は OK", () => {
    const result = validateCableLoadV1("VVF-1.6-2C", "exposed", 19);
    assert.equal(result.ok, true);
    assert.equal(result.ampacityA, 19);
  });
});

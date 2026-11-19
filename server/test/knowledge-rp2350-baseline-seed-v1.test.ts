import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "tisly-rp2350-baseline-")
);
process.env.NODE_ENV = "test";
process.env.KNOWLEDGE_MODULE_DATA_DIR = dataDir;
process.env.KNOWLEDGE_MODULE_UPLOAD_DIR = path.join(dataDir, "uploads");

const { listKnowledgeModuleItemsV1 } = await import(
  "../src/knowledge/knowledge-module-v1.js"
);
const { RP2350_BASELINE_MODULE_SEED_IDS } = await import(
  "../src/knowledge/knowledge-rp2350-baseline-seed-v1.js"
);

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("rp2350 baseline knowledge seed", () => {
  it("appends the baseline card and keeps an older card", () => {
    const listed = listKnowledgeModuleItemsV1();
    const baseline = listed.find(
      (item) => item.id === RP2350_BASELINE_MODULE_SEED_IDS[0]
    );
    assert.ok(baseline);
    assert.equal(
      baseline?.title,
      "【TiSLY標準仕様】RP2350 全物件共通・統一ベースライン（JST固定・Stream OTA・物理安全・自己診断・出荷鉄則）"
    );
    assert.match(String(baseline?.summary), /1\.2\.67/);
    assert.match(String(baseline?.summary), /1\.6\.12/);
    for (const tag of [
      "#TiSLY標準",
      "#RP2350",
      "#OTA",
      "#フェイルセーフ",
      "#キッティング",
      "#全物件標準",
      "#TiSLY_Core",
    ]) {
      assert.ok(baseline?.tags.includes(tag), tag);
    }
    const staff = listed.find(
      (item) => item.id === "kn-seed-staff-notify-policy-001"
    );
    assert.ok(staff);
    assert.match(String(staff?.title), /社内/);
    const ids = listed.map((item) => item.id);
    assert.equal(
      ids.filter((id) => id === "kn-seed-rp2350-baseline-001").length,
      1
    );
  });
});

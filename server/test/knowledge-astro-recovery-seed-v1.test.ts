import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-astro-recovery-"));
process.env.NODE_ENV = "test";
process.env.KNOWLEDGE_MODULE_DATA_DIR = dataDir;
process.env.KNOWLEDGE_MODULE_UPLOAD_DIR = path.join(dataDir, "uploads");

const { listKnowledgeModuleItemsV1 } = await import(
  "../src/knowledge/knowledge-module-v1.js"
);
const { ASTRO_RECOVERY_MODULE_SEED_IDS } = await import(
  "../src/knowledge/knowledge-astro-recovery-seed-v1.js"
);

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("astro recovery knowledge seed", () => {
  it("appends the card without dropping the baseline", () => {
    const listed = listKnowledgeModuleItemsV1();
    const card = listed.find(
      (item) => item.id === ASTRO_RECOVERY_MODULE_SEED_IDS[0]
    );
    assert.ok(card);
    assert.equal(
      card?.title,
      "【全物件標準】天文タイマー（日没・日の出自動追従＋タイムゾーン対応）＆ 通信復旧自動通知仕様"
    );
    assert.match(card?.summary || "", /15分クールダウン/);
    for (const tag of [
      "#天文タイマー",
      "#自動点灯",
      "#タイムゾーン",
      "#通信復旧通知",
      "#全物件標準",
      "#TiSLY_Core",
    ]) {
      assert.ok(card?.tags.includes(tag), tag);
    }
    assert.ok(
      listed.some((item) => item.id === "kn-seed-rp2350-baseline-001")
    );
  });
});

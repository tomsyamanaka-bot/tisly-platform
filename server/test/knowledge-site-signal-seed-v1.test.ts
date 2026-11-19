import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-site-signal-"));
process.env.NODE_ENV = "test";
process.env.KNOWLEDGE_MODULE_DATA_DIR = dataDir;
process.env.KNOWLEDGE_MODULE_UPLOAD_DIR = path.join(dataDir, "uploads");

const { listKnowledgeModuleItemsV1 } = await import(
  "../src/knowledge/knowledge-module-v1.js"
);
const { SITE_SIGNAL_MODULE_SEED_IDS } = await import(
  "../src/knowledge/knowledge-site-signal-seed-v1.js"
);

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("site signal knowledge seed", () => {
  it("appends the dashboard card after the astro card", () => {
    const listed = listKnowledgeModuleItemsV1();
    const card = listed.find(
      (item) => item.id === SITE_SIGNAL_MODULE_SEED_IDS[0]
    );
    assert.ok(card);
    assert.equal(
      card?.title,
      "【保守DX】全物件「信号機」一覧ダッシュボード（/app 異常優先ソート ＆ ワンタップ切替）"
    );
    assert.match(card?.summary || "", /異常現場を最上部/);
    for (const tag of [
      "#信号機一覧",
      "#一覧ダッシュボード",
      "#保守DX",
      "#異常優先ソート",
      "#全物件標準",
      "#TiSLY_Core",
    ]) {
      assert.ok(card?.tags.includes(tag), tag);
    }
    assert.ok(
      listed.some((item) => item.id === "kn-seed-astro-recovery-001")
    );
  });
});

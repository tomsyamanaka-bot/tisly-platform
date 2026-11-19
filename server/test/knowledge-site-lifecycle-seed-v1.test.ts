import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tisly-site-life-"));
process.env.NODE_ENV = "test";
process.env.KNOWLEDGE_MODULE_DATA_DIR = dataDir;
process.env.KNOWLEDGE_MODULE_UPLOAD_DIR = path.join(dataDir, "uploads");

const { listKnowledgeModuleItemsV1 } = await import(
  "../src/knowledge/knowledge-module-v1.js"
);
const { SITE_LIFECYCLE_MODULE_SEED_IDS } = await import(
  "../src/knowledge/knowledge-site-lifecycle-seed-v1.js"
);

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("site lifecycle knowledge seed", () => {
  it("appends the lifecycle card without dropping the signal card", () => {
    const listed = listKnowledgeModuleItemsV1();
    const card = listed.find(
      (item) => item.id === SITE_LIFECYCLE_MODULE_SEED_IDS[0]
    );
    assert.ok(card);
    assert.equal(
      card?.title,
      "【運用標準】物件ライフサイクル管理（本番/デモ/アーカイブ/安全削除）＆ 子機ユニット増減管理仕様"
    );
    assert.match(card?.summary || "", /未設置の子機/);
    for (const tag of [
      "#物件管理",
      "#デモ管理",
      "#子機増設",
      "#アーカイブ",
      "#保守DX",
      "#TiSLY_Core",
    ]) {
      assert.ok(card?.tags.includes(tag), tag);
    }
    assert.ok(listed.some((item) => item.id === "kn-seed-site-signal-001"));
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isCorruptQuestionMarkText,
  resolveProjectDisplayName,
} from "../src/business/pdf/pdf-text-sanitize.js";

describe("resolveProjectDisplayName", () => {
  it("優先順位: customerName → clientName → siteName → title → 未設定", () => {
    assert.equal(
      resolveProjectDisplayName({
        customerName: "株式会社伝元",
        clientName: "客B",
        siteName: "現場A",
        title: "件名",
      }),
      "株式会社伝元"
    );
    assert.equal(
      resolveProjectDisplayName({
        customerName: "???????",
        clientName: "KSフロンティア様",
        siteName: "現場A",
      }),
      "KSフロンティア様"
    );
    assert.equal(
      resolveProjectDisplayName({
        customerName: "",
        siteName: "現場A",
        title: "件名",
      }),
      "現場A"
    );
    assert.equal(resolveProjectDisplayName({ customerName: "  ", title: "件名" }), "件名");
    assert.equal(resolveProjectDisplayName({}), "未設定");
  });

  it("??????? は未設定扱い", () => {
    assert.equal(isCorruptQuestionMarkText("???????"), true);
    assert.equal(resolveProjectDisplayName({ customerName: "???????" }), "未設定");
    assert.equal(resolveProjectDisplayName({ customerName: "???現場" }), "現場");
  });
});

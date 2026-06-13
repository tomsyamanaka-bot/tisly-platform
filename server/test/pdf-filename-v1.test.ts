import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectPdfFileName,
  formatCustomerNameForPdfFile,
  sanitizePdfFileNameSegment,
} from "../src/projects/project-pdf-store.js";

describe("PDF ファイル名 sanitize / 命名", () => {
  it("sanitizePdfFileNameSegment — 禁止文字を除去", () => {
    assert.equal(sanitizePdfFileNameSegment('上田/太郎:テスト?"<>|'), "上田_太郎_テスト_____");
    assert.equal(sanitizePdfFileNameSegment("  "), "案件");
  });

  it("formatCustomerNameForPdfFile — 様付き", () => {
    assert.equal(formatCustomerNameForPdfFile("上田"), "上田様");
    assert.equal(formatCustomerNameForPdfFile("上田様"), "上田様");
  });

  it("buildProjectPdfFileName — 種別_顧客名_件名.pdf", () => {
    assert.equal(
      buildProjectPdfFileName("estimate", "上田", "カメラ工事"),
      "見積書_上田様_カメラ工事.pdf"
    );
    assert.equal(
      buildProjectPdfFileName("invoice", "上田", "カメラ工事"),
      "請求書_上田様_カメラ工事.pdf"
    );
    assert.equal(
      buildProjectPdfFileName("specification", "上田", "カメラ工事"),
      "仕様書_上田様_カメラ工事.pdf"
    );
    assert.equal(
      buildProjectPdfFileName("report", "上田", "カメラ工事"),
      "完了報告書_上田様_カメラ工事.pdf"
    );
  });

  it("buildProjectPdfFileName — 80文字以内に丸める", () => {
    const longSubject = "あ".repeat(100);
    const name = buildProjectPdfFileName("estimate", "上田", longSubject);
    assert.ok(name.length <= 80, `length=${name.length}`);
    assert.ok(name.endsWith(".pdf"));
    assert.ok(name.startsWith("見積書_上田様_"));
  });
});

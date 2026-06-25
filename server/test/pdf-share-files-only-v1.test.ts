import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const publicDir = path.join(process.cwd(), "public");

const SHARE_JS_FILES = [
  "js/pdf-share-v1.js",
  "js/document-viewer-v1.js",
  "js/estimate-v1.js",
  "js/projects-v1.js",
  "js/project-mgmt-detail-v1.js",
  "js/survey-v1.js",
  "js/survey-pdf-actions-v1.js",
];

describe("pdf-share-files-only-v1", () => {
  it("pdf-share-v1 uses files-only navigator.share", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/pdf-share-v1.js"), "utf-8");
    assert.ok(js.includes("navigatorShareFilesOnly"));
    assert.ok(js.includes("clearBlobUrlsFromPage"));
    assert.ok(js.includes("{ files: [file] }"));
    assert.ok(!js.includes("navigator.share({ title"));
    assert.ok(!js.includes("navigator.share({ url"));
    assert.ok(!js.includes("navigator.share({ text"));
  });

  for (const rel of SHARE_JS_FILES) {
    it(`${rel} does not pass url/title/text to navigator.share`, () => {
      const js = fs.readFileSync(path.join(publicDir, rel), "utf-8");
      assert.ok(!js.includes("navigator.share({ title"));
      assert.ok(!js.includes("navigator.share({ url"));
      assert.ok(!js.includes("navigator.share({ text"));
    });
  }

  it("document-viewer clears blob URLs before share", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/document-viewer-v1.js"), "utf-8");
    assert.ok(js.includes("clearBlobUrlsFromPage"));
    assert.ok(js.includes("sharePdfBlobAsFile"));
  });
});

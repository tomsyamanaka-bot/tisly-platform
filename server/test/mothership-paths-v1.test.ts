import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMothershipFileRelativePath,
  buildMothershipProjectRelativePath,
  buildMothershipProjectSegment,
  buildMothershipRepoBackupRelativePath,
  isValidProjectNoV1,
  parseProjectNoV1,
} from "../src/storage/mothership-paths-v1.js";

describe("mothership-paths-v1", () => {
  it("parseProjectNoV1 — with sequence", () => {
    const p = parseProjectNoV1("MO-26-0620-001");
    assert.ok(p);
    assert.equal(p.cityCode, "MO");
    assert.equal(p.yy, "26");
    assert.equal(p.mmdd, "0620");
    assert.equal(p.seq, "001");
    assert.equal(p.datePrefix, "MO-26-0620");
  });

  it("parseProjectNoV1 — date prefix only", () => {
    const p = parseProjectNoV1("JY-26-0701");
    assert.ok(p);
    assert.equal(p.cityCode, "JY");
    assert.equal(p.seq, null);
    assert.equal(p.datePrefix, "JY-26-0701");
  });

  it("isValidProjectNoV1 rejects invalid", () => {
    assert.equal(isValidProjectNoV1("BIZ-123"), false);
    assert.equal(isValidProjectNoV1("MO-26-0620-001"), true);
  });

  it("buildMothershipProjectRelativePath", () => {
    const path = buildMothershipProjectRelativePath(
      "Photos",
      "MO-26-0620-001",
      "守谷市テスト",
      "survey"
    );
    assert.match(path, /^Photos\/MO-26-0620-001_/);
    assert.match(path, /\/survey$/);
  });

  it("buildMothershipFileRelativePath", () => {
    const path = buildMothershipFileRelativePath({
      category: "Documents",
      projectNo: "MO-26-0620-001",
      siteName: "テスト現場",
      fileName: "見積書.pdf",
      subFolder: "estimates",
    });
    assert.match(path, /^Documents\//);
    assert.match(path, /見積書\.pdf$/);
  });

  it("buildMothershipProjectSegment sanitizes", () => {
    const seg = buildMothershipProjectSegment("MO-26-0620-001", "現場/A");
    assert.equal(seg.includes("/"), false);
    assert.match(seg, /^MO-26-0620-001_/);
  });

  it("buildMothershipRepoBackupRelativePath", () => {
    assert.equal(buildMothershipRepoBackupRelativePath(), "Backups/repo-mirror");
  });
});

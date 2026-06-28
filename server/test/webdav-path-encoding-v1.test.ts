import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWebDavFullUrl,
  encodeWebDavPath,
  isWebDavMkcolSuccessStatus,
  stripDuplicateWebDavSharePrefix,
} from "../src/business/services/webdav-path-encoding-v1.js";

describe("webdav-path-encoding-v1", () => {
  it("encodeWebDavPath はセグメント単位で日本語をエンコードする", () => {
    const encoded = encodeWebDavPath(
      "TiSLY/projects/MO-26-0709_守谷市/estimates/見積書_上田様_防犯カメラ工事.pdf"
    );
    assert.ok(!encoded.includes("/TiSLY/"));
    assert.ok(encoded.includes("%E8%A6%8B%E7%A9%8D%E6%9B%B8"));
    assert.ok(encoded.includes("MO-26-0709"));
    assert.ok(!encoded.includes("見積書"));
  });

  it("stripDuplicateWebDavSharePrefix は WebDAV URL 共有名の二重付与を除去", () => {
    const base = "https://100.99.31.120:5006/TiSLY";
    const remote = "TiSLY/projects/MO-26-0709_守谷市/estimates/見積書.pdf";
    assert.equal(
      stripDuplicateWebDavSharePrefix(base, remote),
      "projects/MO-26-0709_守谷市/estimates/見積書.pdf"
    );
  });

  it("buildWebDavFullUrl は共有名二重除去後にエンコードする", () => {
    const url = buildWebDavFullUrl(
      "https://100.99.31.120:5006/TiSLY",
      "TiSLY/projects/MO-26-0709_守谷市/estimates/見積書_上田様_防犯カメラ工事.pdf"
    );
    assert.match(url, /^https:\/\/100\.99\.31\.120:5006\/TiSLY\/projects\//);
    assert.ok(url.includes("%E8%A6%8B%E7%A9%8D%E6%9B%B8"));
    assert.ok(!url.includes("/TiSLY/TiSLY"));
    assert.ok(!url.includes("見積書_上田"));
  });

  it("isWebDavMkcolSuccessStatus は 405/409 を既存成功扱い", () => {
    assert.equal(isWebDavMkcolSuccessStatus(201), true);
    assert.equal(isWebDavMkcolSuccessStatus(405), true);
    assert.equal(isWebDavMkcolSuccessStatus(409), true);
    assert.equal(isWebDavMkcolSuccessStatus(404), false);
  });
});

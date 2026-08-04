import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearDiscoveredWebDavUrlCache,
  isCertificateFetchError,
  isTailscaleOrPrivateHost,
  isWebDavMethodAcceptedStatus,
  listWebDavRootPathCandidates,
  listWebDavUrlCandidates,
  rememberDiscoveredWebDavUrl,
  shouldUseInsecureTls,
  withQnapWebDavHeaders,
  WEBDAV_PORT_FALLBACKS,
} from "../src/business/services/qnap-webdav-fetch-v1.js";

describe("qnap-webdav-fetch-v1", () => {
  it("detects Tailscale CGNAT hosts", () => {
    assert.equal(isTailscaleOrPrivateHost("100.99.31.120"), true);
    assert.equal(isTailscaleOrPrivateHost("8.8.8.8"), false);
    assert.equal(isTailscaleOrPrivateHost("192.168.1.10"), true);
  });

  it("auto insecure TLS for Tailscale HTTPS URLs", () => {
    delete process.env.QNAP_WEBDAV_TLS_INSECURE;
    assert.equal(shouldUseInsecureTls("https://100.99.31.120:5006/TiSLY"), true);
    assert.equal(shouldUseInsecureTls("https://nas.example.com:5006/TiSLY"), false);
  });

  it("respects QNAP_WEBDAV_TLS_INSECURE override", () => {
    process.env.QNAP_WEBDAV_TLS_INSECURE = "true";
    assert.equal(shouldUseInsecureTls("https://nas.example.com:5006/TiSLY"), true);
    process.env.QNAP_WEBDAV_TLS_INSECURE = "false";
    assert.equal(shouldUseInsecureTls("https://100.99.31.120:5006/TiSLY"), false);
    delete process.env.QNAP_WEBDAV_TLS_INSECURE;
  });

  it("port fallbacks prioritize 8080 then 5005/5006/5000", () => {
    assert.deepEqual(
      WEBDAV_PORT_FALLBACKS.map((f) => f.port),
      ["8080", "5005", "5006", "5000"]
    );
  });

  it("rejects HTTP 501 as non-WebDAV", () => {
    assert.equal(isWebDavMethodAcceptedStatus(501), false);
    assert.equal(isWebDavMethodAcceptedStatus(207), true);
    assert.equal(isWebDavMethodAcceptedStatus(401), true);
    assert.equal(isWebDavMethodAcceptedStatus(405), true);
  });

  it("adds User-Agent and Translate headers", () => {
    const h = withQnapWebDavHeaders({ Authorization: "Basic abc" });
    assert.equal(h["User-Agent"], "TiSLY-PWA");
    assert.equal(h.Translate, "f");
    assert.equal(h.Authorization, "Basic abc");
  });

  it("lists WebDAV root path candidates including / Public TiSLY", () => {
    const paths = listWebDavRootPathCandidates("/TiSLY/", 8080);
    assert.ok(paths.includes("/"));
    assert.ok(paths.includes("/Public/"));
    assert.ok(paths.includes("/TiSLY/"));
  });

  it("lists smart port fallbacks for WebDAV URL (8080 first with paths)", () => {
    clearDiscoveredWebDavUrlCache();
    const candidates = listWebDavUrlCandidates("https://100.99.31.120:5006/TiSLY");
    assert.ok(candidates[0].includes(":8080"));
    assert.ok(candidates.some((c) => c.includes("http://100.99.31.120:8080")));
    assert.ok(candidates.some((c) => c === "http://100.99.31.120:8080/Public"));
    assert.ok(candidates.some((c) => c === "http://100.99.31.120:8080/TiSLY"));
    assert.ok(candidates.some((c) => c.includes(":5005")));
    assert.ok(candidates.some((c) => c.includes("https://100.99.31.120:5006")));
    assert.ok(candidates.some((c) => c.includes(":5000")));
    const idx8080 = candidates.findIndex((c) => c.includes(":8080"));
    const idx5005 = candidates.findIndex((c) => c.includes(":5005"));
    const idx5006 = candidates.findIndex((c) => c.includes(":5006"));
    const idx5000 = candidates.findIndex((c) => c.includes(":5000"));
    assert.ok(idx8080 < idx5005);
    assert.ok(idx5005 < idx5006);
    assert.ok(idx5006 < idx5000);
  });

  it("prioritizes discovered URL then 8080 path variants", () => {
    clearDiscoveredWebDavUrlCache();
    rememberDiscoveredWebDavUrl("http://100.99.31.120:8080/Public");
    const candidates = listWebDavUrlCandidates("https://100.99.31.120:5006/TiSLY");
    assert.equal(candidates[0], "http://100.99.31.120:8080/Public");
    assert.ok(candidates.some((c) => c.includes(":5005")));
    assert.equal(process.env.QNAP_WEBDAV_DISCOVERED_PORT, "8080");
    clearDiscoveredWebDavUrlCache();
  });

  it("detects certificate-related fetch errors", () => {
    assert.equal(isCertificateFetchError("unable to verify the first certificate"), true);
    assert.equal(isCertificateFetchError("ECONNREFUSED"), false);
  });
});

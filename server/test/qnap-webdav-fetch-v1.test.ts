import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearDiscoveredWebDavUrlCache,
  isCertificateFetchError,
  isTailscaleOrPrivateHost,
  listWebDavUrlCandidates,
  rememberDiscoveredWebDavUrl,
  shouldUseInsecureTls,
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

  it("lists smart port fallbacks for WebDAV URL", () => {
    clearDiscoveredWebDavUrlCache();
    const candidates = listWebDavUrlCandidates("https://100.99.31.120:5006/TiSLY");
    assert.equal(candidates[0], "http://100.99.31.120:5005/TiSLY");
    assert.ok(candidates.includes("https://100.99.31.120:5006/TiSLY"));
    assert.ok(candidates.includes("http://100.99.31.120:5000/TiSLY"));
    assert.ok(candidates.includes("http://100.99.31.120:8080/TiSLY"));
    assert.ok(candidates.includes("http://100.99.31.120:80/TiSLY"));
    const idx5005 = candidates.indexOf("http://100.99.31.120:5005/TiSLY");
    const idx5006 = candidates.indexOf("https://100.99.31.120:5006/TiSLY");
    const idx5000 = candidates.indexOf("http://100.99.31.120:5000/TiSLY");
    const idx8080 = candidates.indexOf("http://100.99.31.120:8080/TiSLY");
    const idx80 = candidates.indexOf("http://100.99.31.120:80/TiSLY");
    assert.ok(idx5005 < idx5006);
    assert.ok(idx5006 < idx5000);
    assert.ok(idx5000 < idx8080);
    assert.ok(idx8080 < idx80);
  });

  it("prioritizes http:5005 even when discovered port differs", () => {
    clearDiscoveredWebDavUrlCache();
    rememberDiscoveredWebDavUrl("http://100.99.31.120:8080/TiSLY");
    const candidates = listWebDavUrlCandidates("https://100.99.31.120:5006/TiSLY");
    assert.equal(candidates[0], "http://100.99.31.120:5005/TiSLY");
    assert.ok(candidates.includes("http://100.99.31.120:8080/TiSLY"));
    assert.equal(process.env.QNAP_WEBDAV_DISCOVERED_PORT, "8080");
    clearDiscoveredWebDavUrlCache();
  });

  it("detects certificate-related fetch errors", () => {
    assert.equal(isCertificateFetchError("unable to verify the first certificate"), true);
    assert.equal(isCertificateFetchError("ECONNREFUSED"), false);
  });
});

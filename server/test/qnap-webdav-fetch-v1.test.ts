import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isCertificateFetchError,
  isTailscaleOrPrivateHost,
  listWebDavUrlCandidates,
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

  it("lists HTTP 8080 fallback for HTTPS WebDAV URL", () => {
    const candidates = listWebDavUrlCandidates("https://100.99.31.120:5006/TiSLY");
    assert.deepEqual(candidates, [
      "https://100.99.31.120:5006/TiSLY",
      "http://100.99.31.120:8080/TiSLY",
    ]);
  });

  it("detects certificate-related fetch errors", () => {
    assert.equal(isCertificateFetchError("unable to verify the first certificate"), true);
    assert.equal(isCertificateFetchError("ECONNREFUSED"), false);
  });
});

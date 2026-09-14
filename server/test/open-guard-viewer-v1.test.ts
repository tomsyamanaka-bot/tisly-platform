import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const {
  detectGuardViewerPlatformV1,
  storeUrlForGuardViewerV1,
  GUARD_VIEWER_SCHEME_V1,
  GUARD_VIEWER_APP_STORE_V1,
  GUARD_VIEWER_PLAY_STORE_V1,
  GUARD_VIEWER_EZCLOUD_V1,
  GUARD_VIEWER_HINT_V1,
  GUARD_VIEWER_FALLBACK_MS_V1,
  GUARD_VIEWER_FALLBACK_MAX_MS_V1,
} = await import(
  "../public/js/features/security/open-guard-viewer-v1.js"
);

const publicDir = path.join(process.cwd(), "public");

describe("open-guard-viewer-v1", () => {
  it("detects ios android and desktop", () => {
    assert.equal(
      detectGuardViewerPlatformV1("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", 5),
      "ios"
    );
    assert.equal(
      detectGuardViewerPlatformV1("Mozilla/5.0 (iPad; CPU OS 17_0)", 5),
      "ios"
    );
    assert.equal(
      detectGuardViewerPlatformV1("Mozilla/5.0 (Macintosh) ", 5),
      "ios"
    );
    assert.equal(
      detectGuardViewerPlatformV1("Mozilla/5.0 (Linux; Android 14)", 2),
      "android"
    );
    assert.equal(
      detectGuardViewerPlatformV1("Mozilla/5.0 (Windows NT 10.0)", 0),
      "desktop"
    );
  });

  it("maps store and ezcloud URLs", () => {
    assert.equal(GUARD_VIEWER_SCHEME_V1, "guardviewer://");
    assert.match(GUARD_VIEWER_APP_STORE_V1, /id1112445831/);
    assert.match(GUARD_VIEWER_PLAY_STORE_V1, /com\.mcu\.uview/);
    assert.equal(
      GUARD_VIEWER_EZCLOUD_V1,
      "https://en.ezcloud.uniview.com/"
    );
    assert.equal(GUARD_VIEWER_FALLBACK_MS_V1, 1500);
    assert.equal(GUARD_VIEWER_FALLBACK_MAX_MS_V1, 2000);
    assert.equal(
      storeUrlForGuardViewerV1("ios"),
      GUARD_VIEWER_APP_STORE_V1
    );
    assert.equal(
      storeUrlForGuardViewerV1("android"),
      GUARD_VIEWER_PLAY_STORE_V1
    );
    assert.equal(
      storeUrlForGuardViewerV1("desktop"),
      GUARD_VIEWER_EZCLOUD_V1
    );
    assert.match(GUARD_VIEWER_HINT_V1, /Guard Viewerアプリで確認/);
  });

  it("customer camera CTAs launch Guard Viewer without preview API", () => {
    const toyoshimaJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/toyoshima-security-dashboard-v1.js"
      ),
      "utf8"
    );
    const customerJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/security-floor-customer-v1.js"
      ),
      "utf8"
    );
    const previewJs = fs.readFileSync(
      path.join(publicDir, "js/camera-webrtc-viewer-v1.js"),
      "utf8"
    );
    const homeJs = fs.readFileSync(
      path.join(publicDir, "js/customer-v1.js"),
      "utf8"
    );
    const sharedJs = fs.readFileSync(
      path.join(publicDir, "js/customer-shared-v1.js"),
      "utf8"
    );
    const monitoringJs = fs.readFileSync(
      path.join(publicDir, "js/customer-monitoring-v1.js"),
      "utf8"
    );
    const custHtml = fs.readFileSync(
      path.join(publicDir, "security-customer-v1.html"),
      "utf8"
    );
    const launcherJs = fs.readFileSync(
      path.join(
        publicDir,
        "js/features/security/open-guard-viewer-v1.js"
      ),
      "utf8"
    );
    assert.match(toyoshimaJs, /openGuardViewerAppV1|data-gv-launch/);
    assert.match(toyoshimaJs, /GUARD_VIEWER_HINT_V1/);
    assert.doesNotMatch(toyoshimaJs, /openCustomerCameraPreview/);
    assert.match(customerJs, /bindGuardViewerLaunchersV1|openGuardViewerAppV1/);
    assert.doesNotMatch(customerJs, /openCustomerCameraPreview/);
    assert.match(previewJs, /openGuardViewerAppV1/);
    assert.match(
      previewJs,
      /export async function openCustomerCameraPreview[\s\S]*openGuardViewerAppV1/
    );
    assert.doesNotMatch(
      previewJs,
      /export async function openCustomerCameraPreview[\s\S]*\/api\/camera-preview\/v1\/list/
    );
    assert.match(homeJs, /openGuardViewerAppV1/);
    assert.doesNotMatch(homeJs, /openCustomerCameraPreview/);
    assert.match(sharedJs, /Guard Viewerアプリで確認/);
    assert.match(monitoringJs, /openGuardViewerAppV1/);
    assert.doesNotMatch(monitoringJs, /openCustomerCameraPreview/);
    assert.match(custHtml, /data-gv-launch/);
    assert.match(custHtml, /Guard Viewerアプリで確認/);
    assert.match(launcherJs, /window\.location\.href = GUARD_VIEWER_SCHEME_V1/);
    assert.doesNotMatch(launcherJs, /\/api\/camera-preview/);
  });
});

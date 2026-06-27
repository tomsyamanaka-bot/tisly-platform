import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  getDefaultNavFallbackV1,
  backOne as popNavStackV1,
  pushScreen as pushNavStackV1,
  sanitizeNavPathV1,
} from "../src/shared/navigation/tisly-navigation-stack-v1.js";

const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase27 — navigation stack", () => {
  it("push/pop returns exactly one screen", () => {
    let stack: string[] = [];
    stack = pushNavStackV1(stack, "/survey-v1");
    stack = pushNavStackV1(stack, "/estimate-v1?project=1");
    stack = pushNavStackV1(stack, "/project-mgmt-detail-v1?projectId=1");
    const step1 = popNavStackV1(stack);
    assert.equal(step1.target, "/project-mgmt-detail-v1?projectId=1");
    const step2 = popNavStackV1(step1.stack);
    assert.equal(step2.target, "/estimate-v1?project=1");
    const step3 = popNavStackV1(step2.stack);
    assert.equal(step3.target, "/survey-v1");
    assert.equal(popNavStackV1(step3.stack).target, null);
  });

  it("rejects unsafe paths", () => {
    assert.equal(sanitizeNavPathV1("//evil"), null);
    assert.equal(sanitizeNavPathV1("https://evil"), null);
    assert.equal(sanitizeNavPathV1("/estimate-v1"), "/estimate-v1");
  });

  it("customer fallback stays in customer zone", () => {
    assert.equal(getDefaultNavFallbackV1("/customer/project/abc"), "/customer");
    assert.equal(getDefaultNavFallbackV1("/estimate-v1"), "/projects-v1");
    assert.equal(getDefaultNavFallbackV1("/project-mgmt-detail-v1"), "/project-dashboard-v1");
  });
});

describe("Operational Phase27 — PDF share files-only", () => {
  it("pdf-share uses navigatorShareFilesOnly without url/title/text", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/pdf-share-v1.js"), "utf-8");
    assert.ok(js.includes("navigatorShareFilesOnly"));
    assert.ok(js.includes("clearBlobUrlsFromPage"));
    assert.ok(js.includes('sharePayload = { files: [file] }'));
    assert.ok(!js.includes("navigator.share({ title, url"));
    assert.ok(!js.includes("navigator.share({ url"));
    assert.ok(!js.includes("navigator.share({ text"));
  });
});

describe("Operational Phase27 — back navigation (no browser history)", () => {
  const files = [
    "js/tisly-practical-nav.js",
    "js/tisly-navigation-stack-v1.js",
    "js/tisly-return-nav-v1.js",
    "js/app-hub.js",
    "js/document-viewer-v1.js",
    "js/estimate-v1.js",
    "js/survey-v1.js",
    "js/projects-v1.js",
    "js/project-mgmt-detail-v1.js",
    "js/customer-document-v1.js",
    "js/customer-nav-v1.js",
  ];

  for (const rel of files) {
    it(`${rel} avoids history.back`, () => {
      const js = fs.readFileSync(path.join(publicDir, rel), "utf-8");
      assert.doesNotMatch(js, /history\.back\(/);
      assert.doesNotMatch(js, /history\.go\(/);
    });
  }

  it("practical nav uses navigateBackOne and popstate guard", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-practical-nav.js"), "utf-8");
    const navStack = fs.readFileSync(path.join(publicDir, "js/tisly-navigation-stack-shared-v1.js"), "utf-8");
    const navStackJs = fs.readFileSync(path.join(publicDir, "js/tisly-navigation-stack-v1.js"), "utf-8");
    assert.ok(js.includes("navigateBackOne"));
    assert.ok(js.includes("navigateTo"));
    assert.ok(js.includes("bindPopstateBackGuard"));
    assert.ok(navStack.includes("safeReturn"));
    assert.ok(navStack.includes("getNavZoneV1"));
    assert.ok(navStackJs.includes("bindPopstateBackGuard"));
    assert.doesNotMatch(js, /history\.forward/);
  });

  it("return nav validates zone on return query", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-return-nav-v1.js"), "utf-8");
    assert.ok(js.includes("isValidReturnUrlV1"));
    assert.ok(js.includes("explicitReturn"));
  });
});

describe("Operational Phase27 — cache version", () => {
  it("SW token phase27", async () => {
    const { CUSTOMER_JS_VERSION_V1, CUSTOMER_SW_TOKEN_V1 } = await import(
      "../src/shared/customer/customer-cache-v1.js"
    );
    assert.equal(CUSTOMER_JS_VERSION_V1, "customer-v1-phase27");
    assert.equal(CUSTOMER_SW_TOKEN_V1, "v2406-phase27");
    const sw = fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf-8");
    assert.ok(sw.includes("v2406-phase27"));
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  backOne as popNavStackV1,
  pushScreen as pushNavStackV1,
  safeReturn,
} from "../src/shared/navigation/tisly-navigation-stack-v1.js";

const publicDir = path.join(process.cwd(), "public");

describe("Operational Phase29 — back navigation one step", () => {
  it("safeReturn prefers stack pop over explicitReturn", () => {
    let stack = pushNavStackV1([], "/project-mgmt-detail-v1?projectId=1");
    stack = pushNavStackV1(stack, "/estimate-v1?projectId=1");
    const result = safeReturn(stack, {
      fallback: "/projects-v1",
      zone: "internal",
      explicitReturn: "/app",
    });
    assert.equal(result.target, "/estimate-v1?projectId=1");
    assert.equal(result.stack.length, 1);
  });

  it("safeReturn uses explicitReturn when stack empty", () => {
    const result = safeReturn([], {
      fallback: "/projects-v1",
      zone: "internal",
      explicitReturn: "/project-mgmt-detail-v1?projectId=1",
    });
    assert.equal(result.target, "/project-mgmt-detail-v1?projectId=1");
  });

  it("navigation stack seeds return query and link capture", () => {
    const navJs = fs.readFileSync(path.join(publicDir, "js/tisly-navigation-stack-v1.js"), "utf-8");
    assert.ok(navJs.includes("seedNavigationStackFromReturnQuery"));
    assert.ok(navJs.includes("bindInternalLinkDepartureCapture"));
  });

  it("return nav stack branch does not pass explicitReturn", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/tisly-return-nav-v1.js"), "utf-8");
    const stackBlock = js.slice(js.indexOf("if (hasNavStackEntry())"), js.indexOf("if (ret && isValidReturnUrlV1"));
    assert.ok(stackBlock.includes("navigateBackOne({ fallback: fb })"));
    assert.doesNotMatch(stackBlock, /explicitReturn/);
  });
});

describe("Operational Phase29 — drawing plot coordinates", () => {
  it("survey-drawing imageCoords uses rect ratio not viewport.scale", () => {
    const js = fs.readFileSync(path.join(publicDir, "js/survey-drawing-v1.js"), "utf-8");
    const fn = js.slice(js.indexOf("function imageCoords"), js.indexOf("function pathColor"));
    assert.match(fn, /rect\.width/);
    assert.match(fn, /stageSize\.w/);
    assert.doesNotMatch(fn, /viewport\.scale/);
    assert.ok(js.includes("resolveSurveyProjectIdIfNeeded"));
  });

  it("drawing editor canvas uses getBoundingClientRect normalization", () => {
    const js = fs.readFileSync(
      path.join(publicDir, "js/features/drawing/drawing-editor-canvas-v1.js"),
      "utf-8"
    );
    assert.match(js, /getBoundingClientRect/);
    assert.match(js, /rect\.width/);
  });
});

describe("Operational Phase29 — QNAP WebDAV path encoding", () => {
  it("qnapWebDav encodes path segments for Japanese filenames", () => {
    const ts = fs.readFileSync(
      path.join(process.cwd(), "src/business/services/qnapWebDav.ts"),
      "utf-8"
    );
    assert.ok(ts.includes("encodeWebDavPath"));
    assert.ok(ts.includes("stripDuplicateWebDavSharePrefix"));
    assert.ok(ts.includes("maxAttempts = 3"));
    assert.ok(ts.includes("[QNAP WebDAV PUT]"));
  });

  it("webdav fetch default timeout is 3s (504 avoidance)", () => {
    const ts = fs.readFileSync(
      path.join(process.cwd(), "src/business/services/qnap-webdav-fetch-v1.ts"),
      "utf-8"
    );
    assert.match(ts, /QNAP_WEBDAV_TIMEOUT_MS \|\| "3000"/);
    assert.match(ts, /AbortController/);
  });

  it("webdav storage provider retries PUT", () => {
    const ts = fs.readFileSync(
      path.join(process.cwd(), "src/storage/providers/webdav-storage-provider.ts"),
      "utf-8"
    );
    assert.ok(ts.includes("WEBDAV_PUT_MAX_RETRIES_V1"));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  backOne,
  getDefaultNavFallbackV1,
  getNavZoneV1,
  getReturnUrl,
  isValidReturnUrlV1,
  pushScreen,
  replaceCurrent,
  safeReturn,
  sanitizeNavPathV1,
} from "../src/shared/navigation/tisly-navigation-stack-v1.js";

describe("navigation-stack-v1", () => {
  it("push/backOne moves exactly one screen", () => {
    let stack: string[] = [];
    stack = pushScreen(stack, "/survey-v1");
    stack = pushScreen(stack, "/estimate-v1?project=1");
    stack = pushScreen(stack, "/projects-v1?projectId=1");
    const step1 = backOne(stack);
    assert.equal(step1.target, "/projects-v1?projectId=1");
    const step2 = backOne(step1.stack);
    assert.equal(step2.target, "/estimate-v1?project=1");
    const step3 = backOne(step2.stack);
    assert.equal(step3.target, "/survey-v1");
    assert.equal(backOne(step3.stack).target, null);
  });

  it("replaceCurrent updates top entry", () => {
    let stack = pushScreen([], "/estimate-v1");
    stack = replaceCurrent(stack, "/estimate-v1?tab=invoice");
    assert.deepEqual(stack, ["/estimate-v1?tab=invoice"]);
  });

  it("safeReturn prefers explicit return within zone", () => {
    const stack = pushScreen([], "/survey-v1");
    const r = safeReturn(stack, {
      fallback: "/app",
      zone: "internal",
      explicitReturn: "/projects-v1",
    });
    assert.equal(r.target, "/projects-v1");
    assert.deepEqual(r.stack, stack);
  });

  it("safeReturn blocks cross-zone explicit return and uses stack", () => {
    const stack = pushScreen([], "/customer/project/abc");
    const r = safeReturn(stack, {
      fallback: "/customer",
      zone: "customer",
      explicitReturn: "/app",
    });
    assert.equal(r.target, "/customer/project/abc");
  });

  it("getReturnUrl respects zone", () => {
    const stack = pushScreen([], "/app");
    assert.equal(getReturnUrl(stack, "/customer", "customer"), "/customer");
    assert.equal(getReturnUrl(stack, "/app", "internal"), "/app");
  });

  it("sanitize rejects unsafe paths", () => {
    assert.equal(sanitizeNavPathV1("//evil"), null);
    assert.equal(sanitizeNavPathV1("https://evil"), null);
    assert.equal(sanitizeNavPathV1("/estimate-v1"), "/estimate-v1");
  });

  it("zone detection", () => {
    assert.equal(getNavZoneV1("/customer/TOMS001"), "customer");
    assert.equal(getNavZoneV1("/estimate-v1"), "internal");
    assert.equal(isValidReturnUrlV1("/app", "internal"), true);
    assert.equal(isValidReturnUrlV1("/app", "customer"), false);
    assert.equal(getDefaultNavFallbackV1("/customer/project/x"), "/customer");
    assert.equal(getDefaultNavFallbackV1("/survey-v1"), "/projects-v1");
    assert.equal(getDefaultNavFallbackV1("/project-mgmt-detail-v1"), "/project-dashboard-v1");
  });
});

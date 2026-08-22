import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildHomeSecurityNotifyPolicyV1,
  processHomeSecurityEventV1,
  resetHomeSecurityNotifyStateV1,
  setHomeSecurityDi1DetectedAtForTestV1,
} from "../src/home/home-security-notify-v1.js";
import {
  getHomeSecurityRulesV1,
  updateHomeSecurityRulesV1,
} from "../src/home/home-security-rules-v1.js";

const SITE = "HOME-JP-ITABASHI-LIVE";

describe("home-security-notify-v1", () => {
  afterEach(() => {
    resetHomeSecurityNotifyStateV1();
  });

  it("notifyPolicy exposes three fixed rows", () => {
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 120,
    });
    const rules = getHomeSecurityRulesV1(SITE);
    const policy = buildHomeSecurityNotifyPolicyV1(rules);
    assert.equal(policy.rows.length, 3);
    assert.equal(policy.rows[0].id, "di1_alone");
    assert.equal(policy.rows[0].enabled, true);
    assert.equal(policy.rows[1].id, "staged_intrusion");
    assert.equal(policy.rows[1].severity, "critical");
    assert.equal(policy.rows[2].id, "di2_alone");
    assert.equal(policy.rows[2].enabled, false);
    assert.match(policy.rows[1].description, /120/);
  });

  it("DI1 alone triggers perimeter alert when guard active", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
    });
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    assert.equal(result.pattern, "pattern_a");
    assert.equal(result.pushSent, true);
  });

  it("DI2 alone is silent (no push)", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
    });
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(result.pattern, "pattern_c");
    assert.equal(result.pushSent, false);
  });

  it("DI1 then DI2 within perimeter sends critical push", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 120,
    });

    await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    const staged = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(staged.pattern, "pattern_b");
    assert.equal(staged.pushSent, true);
  });

  it("DI2 after perimeter window is silent", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 30,
      securityPausedUntil: null,
    });
    setHomeSecurityDi1DetectedAtForTestV1(
      SITE,
      Date.now() - 31_000
    );

    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(result.pattern, "pattern_c");
    assert.equal(result.pushSent, false);
  });
});

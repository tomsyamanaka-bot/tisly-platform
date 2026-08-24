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

  it("notifyPolicy reflects rules flags", () => {
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 120,
      notifyDi1SilentLogOnly: true,
      notifyDi2InstantPush: true,
      notifyStagedMode: "critical",
    });
    const rules = getHomeSecurityRulesV1(SITE);
    const policy = buildHomeSecurityNotifyPolicyV1(rules);
    assert.equal(policy.rows.length, 3);
    assert.equal(policy.rows[0].id, "di1_alone");
    assert.equal(policy.rows[0].enabled, false);
    assert.equal(policy.rows[0].severity, "silent");
    assert.equal(policy.rows[0].mode, "silent");
    assert.equal(policy.rows[1].id, "staged_intrusion");
    assert.equal(policy.rows[1].severity, "critical");
    assert.equal(policy.rows[1].mode, "critical");
    assert.equal(policy.rows[2].id, "di2_alone");
    assert.equal(policy.rows[2].enabled, true);
    assert.equal(policy.rows[2].mode, "critical");
    assert.match(policy.rows[1].description, /120/);
  });

  it("notify modes cycle can silence staged intrusion push", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 120,
      securityPausedUntil: null,
      notifyDi1Mode: "critical",
      notifyStagedMode: "silent",
      notifyDi2Mode: "off",
    });
    await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    const staged = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(staged.pattern, "pattern_b");
    assert.equal(staged.pushSent, false);
  });

  it("DI1 alone triggers perimeter alert when silent flag off", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
      notifyDi1SilentLogOnly: false,
      notifyDi2InstantPush: true,
    });
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    assert.equal(result.pattern, "pattern_a");
    assert.equal(result.pushSent, true);
  });

  it("DI1 alone is silent when notifyDi1SilentLogOnly", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
      notifyDi1SilentLogOnly: true,
    });
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    assert.equal(result.pattern, "pattern_a");
    assert.equal(result.pushSent, false);
  });

  it("DI2 alone is silent when notifyDi2InstantPush off", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
      notifyDi2InstantPush: false,
    });
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(result.pattern, "pattern_c");
    assert.equal(result.pushSent, false);
  });

  it("DI2 alone sends push when notifyDi2InstantPush on", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
      notifyDi2InstantPush: true,
    });
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(result.pattern, "pattern_c");
    assert.equal(result.pushSent, true);
  });

  it("DI1 then DI2 within perimeter sends critical push", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 120,
      notifyDi1SilentLogOnly: false,
      notifyStagedMode: "critical",
      notifyDi2Mode: "critical",
    });

    await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    const staged = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(staged.pattern, "pattern_b");
    assert.equal(staged.pushSent, true);
  });

  it("DI2 after perimeter window follows instant-push flag", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      perimeterTimeoutSec: 30,
      securityPausedUntil: null,
      notifyDi2InstantPush: false,
    });
    setHomeSecurityDi1DetectedAtForTestV1(SITE, Date.now() - 31_000);

    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 2 });
    assert.equal(result.pattern, "pattern_c");
    assert.equal(result.pushSent, false);
  });

  it("same DI within cooldown suppresses additional Push (log only)", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "always",
      securityPausedUntil: null,
      notifyDi1SilentLogOnly: false,
    });
    const first = await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    assert.equal(first.pushSent, true);
    const second = await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    assert.equal(second.pattern, "pattern_a");
    assert.equal(second.pushSent, false);
  });

  it("night_only daytime still sends push when armed", async () => {
    resetHomeSecurityNotifyStateV1(SITE);
    updateHomeSecurityRulesV1(SITE, {
      guardMode: "night_only",
      securityPausedUntil: null,
      notifyDi1SilentLogOnly: false,
      notifyDi1Mode: "critical",
    });
    const { isHomeGuardActiveV1, isHomeSecurityArmedV1 } = await import(
      "../src/home/home-security-rules-v1.js"
    );
    const rules = getHomeSecurityRulesV1(SITE);
    const noon = new Date("2026-08-25T03:00:00.000Z");
    assert.equal(isHomeSecurityArmedV1(rules, noon), true);
    assert.equal(isHomeGuardActiveV1(rules, noon), false);
    const result = await processHomeSecurityEventV1({ siteId: SITE, di: 1 });
    assert.equal(result.pattern, "pattern_a");
    assert.equal(result.pushSent, true);
  });
});

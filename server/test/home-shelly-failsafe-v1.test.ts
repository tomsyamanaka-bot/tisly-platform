/**
 * Shelly 電源フェイルセーフ v1 テスト
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildShellyLocalWatchdogScriptV1,
  getHomeShellyFailsafeV1,
  maskHomeShellyFailsafeV1,
  maybeTriggerShellyAutoRebootV1,
  resolveShellyFailsafeBaseUrlV1,
  updateHomeShellyFailsafeV1,
} from "../src/home/home-shelly-failsafe-v1.js";
import {
  HOME_JP_TOYOSHIMA_SITE_ID_V1,
  resetToyoshimaSecurityStateForTestV1,
  runToyoshimaHeartbeatWatchdogV1,
  setToyoshimaHeartbeatAtForTestV1,
  TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1,
  buildToyoshimaSecurityDashboardV1,
} from "../src/home/home-toyoshima-security-v1.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = HOME_JP_TOYOSHIMA_SITE_ID_V1;

describe("home-shelly-failsafe-v1", () => {
  afterEach(() => {
    resetToyoshimaSecurityStateForTestV1();
    updateHomeShellyFailsafeV1(SITE, {
      autoRebootEnabled: false,
      shellyHost: "",
      shellyCloudId: "",
      shellyAuthKey: "",
      cooldownMinutes: 20,
      lastAutoRebootAt: null,
    });
  });

  it("stores and masks failsafe settings", () => {
    const saved = updateHomeShellyFailsafeV1(SITE, {
      autoRebootEnabled: true,
      shellyHost: "192.168.10.40",
      shellyCloudId: "cloud-abc",
      shellyAuthKey: "secret-key-1234",
      cooldownMinutes: 25,
    });
    assert.equal(saved.autoRebootEnabled, true);
    assert.equal(saved.shellyHost, "192.168.10.40");
    assert.equal(saved.cooldownMinutes, 25);

    const masked = maskHomeShellyFailsafeV1(getHomeShellyFailsafeV1(SITE));
    assert.equal(masked.shellyAuthKey, "");
    assert.match(masked.shellyAuthKeyMasked, /1234$/);
    assert.equal(
      resolveShellyFailsafeBaseUrlV1(saved),
      "http://192.168.10.40"
    );
  });

  it("skips auto reboot when disabled or in cooldown", async () => {
    updateHomeShellyFailsafeV1(SITE, {
      autoRebootEnabled: false,
      shellyHost: "192.168.10.40",
    });
    const off = await maybeTriggerShellyAutoRebootV1({
      siteId: SITE,
      buildingLabel: "主装置",
    });
    assert.equal(off.triggered, false);
    assert.match(off.skippedReason || "", /OFF/);

    updateHomeShellyFailsafeV1(SITE, {
      autoRebootEnabled: true,
      shellyHost: "192.168.10.40",
      lastAutoRebootAt: new Date().toISOString(),
      cooldownMinutes: 20,
    });
    const cool = await maybeTriggerShellyAutoRebootV1({
      siteId: SITE,
      buildingLabel: "主装置",
    });
    assert.equal(cool.triggered, false);
    assert.match(cool.skippedReason || "", /クールダウン/);
  });

  it("triggers auto reboot when enabled and not cooling down", async () => {
    updateHomeShellyFailsafeV1(SITE, {
      autoRebootEnabled: true,
      shellyHost: "192.168.10.40",
      lastAutoRebootAt: null,
    });
    const attempt = await maybeTriggerShellyAutoRebootV1({
      siteId: SITE,
      buildingLabel: "主装置",
      reason: "テスト途絶",
    });
    assert.equal(attempt.triggered, true);
    assert.ok(attempt.result?.ok);
    assert.ok(attempt.config.lastAutoRebootAt);
  });

  it("watchdog appends shelly_auto_reboot timeline on offline", async () => {
    updateHomeShellyFailsafeV1(SITE, {
      autoRebootEnabled: true,
      shellyHost: "192.168.10.40",
      lastAutoRebootAt: null,
    });
    const stale = new Date(
      Date.now() - TOYOSHIMA_HEARTBEAT_OFFLINE_MS_V1 - 1000
    ).toISOString();
    setToyoshimaHeartbeatAtForTestV1("main", stale);
    await runToyoshimaHeartbeatWatchdogV1();
    const dash = buildToyoshimaSecurityDashboardV1();
    assert.ok(dash.timeline.some((t) => t.kind === "comm_loss"));
    assert.ok(
      dash.timeline.some(
        (t) =>
          t.kind === "shelly_auto_reboot" &&
          /Shelly電源自動再投入/.test(t.detail || "")
      )
    );
  });

  it("builds Shelly Gen3 local watchdog script", () => {
    const script = buildShellyLocalWatchdogScriptV1({
      targetUrl: "http://192.168.1.55/",
      failThreshold: 3,
      intervalMs: 60000,
      offMs: 5000,
    });
    assert.match(script, /Switch\.Set/);
    assert.match(script, /FAIL_LIMIT = 3/);
    assert.match(script, /192\.168\.1\.55/);
    assert.match(script, /電源OFF/);
  });

  it("repo tools script exists for field install", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../.."
    );
    const scriptPath = path.join(
      root,
      "tools/shelly/auto_reboot_watchdog.js"
    );
    // monorepo: tools is at repo root (parent of server)
    const alt = path.join(root, "../tools/shelly/auto_reboot_watchdog.js");
    const file = fs.existsSync(scriptPath)
      ? scriptPath
      : alt;
    assert.ok(fs.existsSync(file), `missing ${file}`);
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /Switch\.Set/);
    assert.match(text, /FAIL_LIMIT = 3/);
  });
});

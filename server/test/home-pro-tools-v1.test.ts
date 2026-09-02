import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  addHomeFieldPhotoV1,
  listHomeFieldPhotosV1,
  syncHomeFieldPhotosToQnapV1,
} from "../src/home/home-field-photos-v1.js";
import {
  listHardwareTestOutputsV1,
  listHardwareDiStatusV1,
  pulseHardwareOutputV1,
  softRebootRp2350V1,
  triggerHardwareDiTestV1,
} from "../src/home/home-hardware-pro-v1.js";
import {
  buildHomeSecurityFirmwareRulesV1,
  getHomeSecurityRulesV1,
  updateHomeSecurityRulesV1,
} from "../src/home/home-security-rules-v1.js";
import { HOME_JP_TOYOSHIMA_SITE_ID_V1 } from "../src/home/home-toyoshima-security-v1.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "../src/home/home-sites-v1.js";
import { queueDeviceSoftRebootV1 } from "../src/remote-test/remote-test-state.js";
import { resetToyoshimaSecurityStateForTestV1 } from "../src/home/home-toyoshima-security-v1.js";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("home-pro-tools-v1", () => {
  afterEach(() => {
    resetToyoshimaSecurityStateForTestV1();
  });

  it("lists 8CH outputs for Itabashi and Toyoshima outputs for Toyoshima", () => {
    const ita = listHardwareTestOutputsV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
    assert.equal(ita.length, 8);
    assert.match(ita[0].label, /DO1/);

    const toy = listHardwareTestOutputsV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.ok(toy.length >= 5);
    assert.ok(toy.some((o) => o.label.includes("母屋")));
    assert.ok(toy.some((o) => o.label.includes("はなれ")));
  });

  it("queues 1s test pulse for Toyoshima DO", () => {
    const result = pulseHardwareOutputV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      outputId: "main-do1",
      durationMs: 1000,
    });
    assert.equal(result.ok, true);
    assert.match(result.message, /母屋/);
  });

  it("queues RP2350 relay pulse for Itabashi DO1", () => {
    const result = pulseHardwareOutputV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      outputId: "do1",
      durationMs: 1000,
    });
    assert.equal(result.ok, true);
    assert.ok(result.command?.includes("pulse"));
  });

  it("soft reboot queues device_soft_reboot command", () => {
    const result = softRebootRp2350V1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    });
    assert.equal(result.ok, true);
    assert.equal(result.command, "device_soft_reboot");
    const queued = queueDeviceSoftRebootV1();
    assert.equal(queued.command, "device_soft_reboot");
  });

  it("persists debounce ms in rules and firmware JSON", () => {
    updateHomeSecurityRulesV1(HOME_ITABASHI_LIVE_SITE_ID_V1, {
      diConfirmMs: 120,
      debounceDi1Ms: 80,
      debounceDi2Ms: 150,
      debounceBeamMs: 200,
    });
    const rules = getHomeSecurityRulesV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
    assert.equal(rules.diConfirmMs, 120);
    assert.equal(rules.debounceDi1Ms, 80);
    const fw = buildHomeSecurityFirmwareRulesV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
    assert.equal(fw.diConfirmMs, 120);
    assert.equal(fw.debounceDi1Ms, 80);
    assert.equal(fw.debounceBeamMs, 200);
  });

  it("lists DI channels for Itabashi and Toyoshima", () => {
    const ita = listHardwareDiStatusV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
    assert.equal(ita.length, 2);
    assert.match(ita[0].label, /DI1/);
    assert.equal(ita[0].stateEmoji, "⚪");

    const toy = listHardwareDiStatusV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.ok(toy.length >= 3);
    assert.ok(toy.some((c) => c.label.includes("主装置")));
    assert.ok(toy.some((c) => c.label.includes("子機")));
  });

  it("triggers DI pseudo alarm for Toyoshima detached DI", async () => {
    const channels = listHardwareDiStatusV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    const target = channels.find((c) => c.building === "detached" && c.di === 1);
    assert.ok(target);
    const result = await triggerHardwareDiTestV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      diId: target.id,
      actor: "operator-pro",
    });
    assert.equal(result.ok, true);
    assert.match(result.message, /道路側|擬似発報|センサー/);
  });

  it("triggers DI pseudo alarm for Itabashi DI1", async () => {
    const result = await triggerHardwareDiTestV1({
      siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
      diId: "di1",
      actor: "operator-pro",
    });
    assert.equal(result.ok, true);
    assert.match(result.message, /DI1/);
  });

  it("stores field photos and marks QNAP sync", async () => {
    const photo = addHomeFieldPhotoV1({
      siteId: HOME_JP_TOYOSHIMA_SITE_ID_V1,
      category: "wiring",
      title: "盤内配線テスト",
      imageBase64: TINY_PNG_BASE64,
      fileName: "test.png",
    });
    assert.equal(photo.categoryLabel, "盤内配線");
    assert.equal(photo.qnapSyncStatus, "pending");

    const list = listHomeFieldPhotosV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.ok(list.some((p) => p.id === photo.id));

    const synced = await syncHomeFieldPhotosToQnapV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.ok(synced.synced >= 1);
    const after = listHomeFieldPhotosV1(HOME_JP_TOYOSHIMA_SITE_ID_V1);
    assert.equal(after.find((p) => p.id === photo.id)?.qnapSyncStatus, "synced");
  });
});

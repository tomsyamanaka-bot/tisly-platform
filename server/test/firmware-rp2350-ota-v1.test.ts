import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "fs";
import path from "path";

process.env.JWT_SECRET = "test-jwt-firmware-rp2350-ota-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-firmware-rp2350-ota-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  resetTislyOtaStoreForTestV1,
  resolveTislyOtaSiteKeyV1,
} = await import("../src/firmware/tisly-rp2350-ota-v1.js");

const app = createApp();

describe("firmware-rp2350-ota-v1", () => {
  before(() => {
    resetTislyOtaStoreForTestV1();
  });

  after(() => {
    closeDatabase();
    try {
      fs.unlinkSync(path.resolve("data/test-firmware-rp2350-ota-v1.db"));
    } catch {
      /* */
    }
  });

  it("resolves toyoshima and itabashi aliases", () => {
    assert.equal(resolveTislyOtaSiteKeyV1("HOME-JP-TOYOSHIMA"), "toyoshima");
    assert.equal(resolveTislyOtaSiteKeyV1("TOYOSHIMA001"), "toyoshima");
    assert.equal(resolveTislyOtaSiteKeyV1("SEC-JP-ITABASHI-LIVE"), "itabashi");
    assert.equal(resolveTislyOtaSiteKeyV1("all"), "all");
    assert.equal(resolveTislyOtaSiteKeyV1("toyoshima"), "toyoshima");
    assert.equal(resolveTislyOtaSiteKeyV1("SEC-JP-TOYOSHIMA-001"), "toyoshima");
    assert.equal(resolveTislyOtaSiteKeyV1("SEC-JP-TOSHIMA-001"), "toyoshima");
  });

  it("GET version marks a newer live bundle as pending", async () => {
    resetTislyOtaStoreForTestV1();
    const res = await request(app).get("/api/firmware/toyoshima/version");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.siteId, "toyoshima");
    assert.equal(typeof res.body.version, "string");
    assert.equal(typeof res.body.checksum, "string");
    assert.equal(res.body.checksum.length, 64);
    assert.equal(res.body.pending, true);
    assert.equal(res.body.has_ota_update, true);
    assert.match(String(res.body.version), /^1\.2\.\d+/);
    assert.ok(res.body.files.includes("main.py"));
    assert.ok(res.body.skipFiles.includes("config.py"));
    assert.ok(res.body.files.includes("lib/tisly_rgb.py"));
    assert.ok(res.body.files.includes("tisly_self_test.py"));
    assert.equal(res.body.kitting.shippable, false);
    assert.equal(typeof res.body.kitting.label, "string");
  });

  it("GET script serves main.py and toyoshima_security.py", async () => {
    const main = await request(app).get(
      "/api/firmware/toyoshima/script?name=main.py"
    );
    assert.equal(main.status, 200);
    assert.match(main.text, /豊島邸/);
    assert.match(main.text, /toyoshima\/command/);
    assert.match(main.text, /_relay_gpio_level/);
    assert.match(main.text, /COMMAND_WAIT_MS = 0/);
    assert.match(main.text, /_channels_for_manual_cmd/);
    assert.match(main.text, /HIGH=コイルON を強制/);
    assert.match(main.text, /sensor_near/);
    assert.match(main.text, /BOARD_CH_GPIO = \{1: 17, 2: 18, 3: 19/);
    assert.match(main.text, /_resolve_pin_map/);
    assert.match(main.text, /SAFE_MODE/);
    assert.match(main.text, /_safe_mode_loop/);
    assert.match(main.text, /_safe_print/);
    assert.match(main.headers["content-type"] || "", /text\/plain/);

    const logic = await request(app).get(
      "/api/firmware/HOME-JP-TOYOSHIMA/script?file=toyoshima_security.py"
    );
    assert.equal(logic.status, 200);
    assert.match(logic.text, /ToyoshimaMainHouseController|heartbeat/);
    assert.match(logic.text, /FIRMWARE_LOGIC_VERSION = "1.2.12"/);
    assert.match(logic.text, /rising fire/);
  });

  it("GET itabashi script serves board firmware", async () => {
    const res = await request(app).get(
      "/api/firmware/itabashi/script?name=security_light.py"
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /SecurityLight|security_light|DI/);
  });

  it("POST deploy sets pending and has_ota_update", async () => {
    const deploy = await request(app)
      .post("/api/firmware/toyoshima/deploy")
      .send({ channel: "production" });
    assert.equal(deploy.status, 200);
    assert.equal(deploy.body.ok, true);
    assert.match(deploy.body.message, /予約/);
    assert.equal(deploy.body.sites[0].pending, true);
    assert.equal(deploy.body.sites[0].has_ota_update, true);

    const version = await request(app).get(
      "/api/firmware/toyoshima/version?firmware_version=1.0.0"
    );
    assert.equal(version.body.has_ota_update, true);
    assert.notEqual(version.body.version, "1.0.0");
  });

  it("POST deploy binds currentSiteId even if path is stale itabashi", async () => {
    resetTislyOtaStoreForTestV1();
    const res = await request(app)
      .post("/api/firmware/itabashi/deploy")
      .send({
        channel: "staging",
        allSites: false,
        siteId: "SEC-JP-TOYOSHIMA-001",
        currentSiteId: "TOYOSHIMA001",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.channel, "staging");
    assert.equal(res.body.sites.length, 1);
    assert.equal(res.body.sites[0].siteId, "toyoshima");
    assert.match(res.body.message, /豊島邸 へステージング配信を予約しました/);
    const version = await request(app).get(
      "/api/firmware/toyoshima/version?channel=staging&firmware_version=1.0.0"
    );
    assert.equal(version.body.has_ota_update, true);
    assert.equal(version.body.pending, true);
    assert.notEqual(version.body.version, "1.0.0");
  });

  it("POST TOYOSHIMA001 deploy targets toyoshima only", async () => {
    resetTislyOtaStoreForTestV1();
    const res = await request(app)
      .post("/api/firmware/TOYOSHIMA001/deploy")
      .send({ channel: "production", currentSiteId: "toyoshima" });
    assert.equal(res.status, 200);
    assert.equal(res.body.sites.length, 1);
    assert.equal(res.body.sites[0].siteId, "toyoshima");
    assert.match(res.body.message, /豊島邸 へ最新ファームウェア配信を予約しました/);
  });

  it("Toyoshima heartbeat returns pending OTA after selected-site deploy", async () => {
    resetTislyOtaStoreForTestV1();
    const deploy = await request(app)
      .post("/api/firmware/itabashi/deploy")
      .send({
        channel: "production",
        allSites: false,
        currentSiteId: "TOYOSHIMA001",
      });
    assert.equal(deploy.body.sites[0].siteId, "toyoshima");
    const latest = String(deploy.body.sites[0].version);
    assert.match(latest, /^\d+\.\d+\.\d+$/);
    const hb = await request(app)
      .post("/api/home/v1/toyoshima/heartbeat")
      .send({
        building: "main",
        deviceId: "rp2350-toyoshima-main-01",
        firmware_version: "1.0.0",
        siteId: "HOME-JP-TOYOSHIMA",
      });
    assert.equal(hb.status, 200);
    assert.equal(hb.body.ok, true);
    assert.equal(hb.body.has_ota_update, true);
    assert.equal(hb.body.firmware_latest, latest);
    assert.equal(hb.body.ota.siteId, "toyoshima");
    assert.notEqual(hb.body.firmware_latest, "1.0.0");
  });

  it("POST all deploy covers both sites", async () => {
    const res = await request(app)
      .post("/api/firmware/all/deploy")
      .send({ channel: "staging", allSites: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.channel, "staging");
    assert.equal(res.body.sites.length, 2);
    const keys = res.body.sites.map((s) => s.siteId).sort();
    assert.deepEqual(keys, ["itabashi", "toyoshima"]);
  });

  it("ships MicroPython OTA engine with A/B rollback", () => {
    const fw = path.resolve(process.cwd(), "../rp2350/firmware");
    const ota = fs.readFileSync(path.join(fw, "lib/tisly_ota.py"), "utf8");
    assert.match(ota, /main_new\.py|main_backup\.py/);
    assert.match(ota, /compile\(/);
    assert.match(ota, /machine\.reset|recover_if_needed/);
    const boot = fs.readFileSync(path.join(fw, "boot.py"), "utf8");
    assert.match(boot, /recover_if_needed|main_backup\.py/);
    const rgb = fs.readFileSync(path.join(fw, "lib/tisly_rgb.py"), "utf8");
    assert.match(rgb, /set_status/);
    assert.match(rgb, /SHIPPABLE|STATUS_SHIPPABLE/);
    const kit = fs.readFileSync(path.join(fw, "tisly_self_test.py"), "utf8");
    assert.match(kit, /shippable\.json/);
    assert.match(kit, /config\.json/);
  });

  it("heartbeat kitting fields mark shippable on version API", async () => {
    resetTislyOtaStoreForTestV1();
    const {
      recordTislyOtaDeviceFirmwareV1,
    } = await import("../src/firmware/tisly-rp2350-ota-v1.js");
    const recorded = recordTislyOtaDeviceFirmwareV1({
      siteKey: "itabashi",
      deviceId: "rp2350-itabashi-main-01",
      firmwareVersion: "1.0.0",
      shippable: true,
      rgbStatus: "SHIPPABLE",
      selfTest: {
        config: true,
        lan: true,
        heartbeat: true,
        ota: true,
      },
    });
    assert.equal(recorded.kitting.shippable, true);
    assert.equal(recorded.kitting.rgbStatus, "SHIPPABLE");
    const version = await request(app).get("/api/firmware/itabashi/version");
    assert.equal(version.body.kitting.shippable, true);
    assert.match(version.body.kitting.label, /出荷準備完了/);
  });

  it("POST /api/devices/firmware/ota stages toyoshima with force", async () => {
    resetTislyOtaStoreForTestV1();
    const res = await request(app)
      .post("/api/devices/firmware/ota")
      .send({
        siteId: "TOYOSHIMA001",
        channel: "production",
        force: true,
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.sites[0].siteId, "toyoshima");
    assert.equal(res.body.sites[0].force, true);
    assert.equal(res.body.sites[0].pending, true);
  });

  it("GET toyoshima command returns queued live-kick", async () => {
    const { queueToyoshimaDeviceCommandV1 } = await import(
      "../src/home/home-toyoshima-command-queue-v1.js"
    );
    queueToyoshimaDeviceCommandV1({
      deviceId: "rp2350-toyoshima-main-01",
      command: "do1_on",
    });
    const res = await request(app).get(
      "/api/home/v1/toyoshima/command?deviceId=rp2350-toyoshima-main-01"
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.command, "do1_on");
    assert.equal(res.body.bypassSchedule, true);
    assert.equal(res.body.pipeline, "immediate");
    const empty = await request(app).get(
      "/api/home/v1/toyoshima/command?deviceId=rp2350-toyoshima-main-01"
    );
    assert.equal(empty.body.command, null);
  });

  it("GET toyoshima command waitMs returns queued live-kick", async () => {
    const {
      queueToyoshimaDeviceCommandV1,
      resetToyoshimaDeviceCommandQueueForTestV1,
    } = await import("../src/home/home-toyoshima-command-queue-v1.js");
    resetToyoshimaDeviceCommandQueueForTestV1();
    queueToyoshimaDeviceCommandV1({
      deviceId: "rp2350-toyoshima-main-01",
      command: "do2_on",
    });
    const res = await request(app).get(
      "/api/home/v1/toyoshima/command?deviceId=rp2350-toyoshima-main-01&waitMs=200"
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.command, "do2_on");
    assert.equal(res.body.pipeline, "immediate");
    assert.equal(res.body.forceRelayTest, true);
  });

  it("heartbeat piggybacks pending live-kick command", async () => {
    const {
      queueToyoshimaDeviceCommandV1,
      resetToyoshimaDeviceCommandQueueForTestV1,
    } = await import("../src/home/home-toyoshima-command-queue-v1.js");
    resetToyoshimaDeviceCommandQueueForTestV1();
    queueToyoshimaDeviceCommandV1({
      deviceId: "rp2350-toyoshima-main-01",
      command: "bulk_on",
    });
    const hb = await request(app)
      .post("/api/home/v1/toyoshima/heartbeat")
      .send({
        building: "main",
        deviceId: "rp2350-toyoshima-main-01",
        firmware_version: "1.0.0",
        siteId: "HOME-JP-TOYOSHIMA",
      });
    assert.equal(hb.status, 200);
    assert.equal(hb.body.command, "bulk_on");
    assert.deepEqual(hb.body.channels, [1, 2, 3]);
    assert.equal(hb.body.bypassSchedule, true);
    assert.equal(hb.body.pipeline, "immediate");
  });

  it("toyoshima firmware long-polls waitMs and HB piggyback", () => {
    const fw = fs.readFileSync(
      path.resolve(process.cwd(), "../rp2350/firmware/main_toyoshima.py"),
      "utf8"
    );
    assert.match(fw, /waitMs=/);
    assert.match(fw, /COMMAND_WAIT_MS/);
    assert.match(fw, /_stash_hb_command/);
    assert.match(fw, /LOOP_IDLE_MS/);
    assert.match(fw, /execute_manual_command/);
    assert.match(fw, /bypass schedule|bypass=1/);
    assert.match(fw, /payload\.get\("channels"\)/);
    assert.match(fw, /CH1\+CH2\+CH3/);
    assert.match(fw, /_channels_for_manual_cmd/);
    assert.match(fw, /HIGH=コイルON を強制/);
    assert.match(fw, /LOOP_IDLE_MS = 50/);
    assert.match(fw, /sensor_near/);
    assert.match(fw, /set_ch_output\(3, False\)/);
    const loop = fw.slice(fw.indexOf("while True:"));
    assert.ok(
      loop.indexOf("poll_inputs()") < loop.indexOf("payload = poll_command()")
    );
    assert.match(fw, /_flush_pending_events/);
    assert.match(fw, /event_retry_loop/);
    assert.match(fw, /event queued/);
    assert.match(fw, /mark_event_acked|event skip acked/);
    assert.match(fw, /_json_dumps_safe/);
    assert.match(fw, /http_post_timed/);
    assert.match(fw, /EVENT_HTTP_TIMEOUT_SEC/);
    assert.ok(
      loop.indexOf("_flush_pending_events()") <
        loop.indexOf("send_heartbeat_with_retry")
    );
  });

  it("GET toyoshima version advertises live 1.2.12 and stages it", async () => {
    resetTislyOtaStoreForTestV1();
    const prod = await request(app).get("/api/firmware/toyoshima/version");
    assert.equal(prod.status, 200);
    assert.match(String(prod.body.version), /^1\.2\.12/);
    assert.equal(prod.body.pending, true);
    const staging = await request(app).get(
      "/api/firmware/toyoshima/version?channel=staging"
    );
    assert.equal(staging.status, 200);
    assert.match(String(staging.body.version), /^1\.2\.\d+/);
    assert.equal(staging.body.pending, true);
    assert.equal(staging.body.channel, "staging");
  });
});

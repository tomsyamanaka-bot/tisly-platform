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

  it("GET version returns checksum json without pending", async () => {
    resetTislyOtaStoreForTestV1();
    const res = await request(app).get("/api/firmware/toyoshima/version");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.siteId, "toyoshima");
    assert.equal(typeof res.body.version, "string");
    assert.equal(typeof res.body.checksum, "string");
    assert.equal(res.body.checksum.length, 64);
    assert.equal(res.body.pending, false);
    assert.equal(res.body.has_ota_update, false);
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
    assert.match(main.headers["content-type"] || "", /text\/plain/);

    const logic = await request(app).get(
      "/api/firmware/HOME-JP-TOYOSHIMA/script?file=toyoshima_security.py"
    );
    assert.equal(logic.status, 200);
    assert.match(logic.text, /ToyoshimaMainHouseController|heartbeat/);
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
});

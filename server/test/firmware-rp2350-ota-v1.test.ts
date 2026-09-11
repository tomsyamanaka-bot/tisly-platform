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
  });
});

/**
 * QNAP Platform Settings / Infrastructure Health GREEN 化 v1
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = "test-jwt-qnap-infra-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-qnap-infra-health-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { getDatabase, closeDatabase } = await import("../src/db/database.js");

describe("qnap-infra-health-v1", () => {
  before(() => {
    getDatabase();
  });

  after(() => {
    closeDatabase();
    try {
      fs.unlinkSync(path.join(process.cwd(), "data/test-qnap-infra-health-v1.db"));
    } catch {
      /* */
    }
  });

  it("connect ports are 8080 → 5005 → 5006 → 5000", async () => {
    const {
      QNAP_CONNECT_PORTS,
      QNAP_PLATFORM_DEFAULT_HOST,
      QNAP_PLATFORM_DEFAULT_USER,
    } = await import("../src/infrastructure/qnap-infra-health-v1.js");
    assert.deepEqual([...QNAP_CONNECT_PORTS], [8080, 5005, 5006, 5000]);
    assert.equal(QNAP_PLATFORM_DEFAULT_HOST, "100.99.31.120");
    assert.equal(QNAP_PLATFORM_DEFAULT_USER, "tomsadmin");
  });

  it("normalize fills defaults host/user", async () => {
    const { normalizeQnapPlatformSettingV1 } = await import(
      "../src/infrastructure/qnap-infra-health-v1.js"
    );
    const n = normalizeQnapPlatformSettingV1({
      mode: "real",
      password: "secret",
    });
    assert.equal(n.mode, "real");
    assert.equal(n.host, "100.99.31.120");
    assert.equal(n.username, "tomsadmin");
    assert.equal(n.password, "secret");
  });

  it("markQnapInfraGreenV1 sets GREEN OK", async () => {
    const {
      markQnapInfraGreenV1,
      getQnapInfraHealthV1,
      resolveQnapInfraComponentStatusV1,
    } = await import("../src/infrastructure/qnap-infra-health-v1.js");
    markQnapInfraGreenV1({
      host: "100.99.31.120",
      port: 5005,
      detail: "OK",
    });
    const h = getQnapInfraHealthV1();
    assert.equal(h.status, "GREEN");
    assert.equal(h.ok, true);
    assert.equal(h.detail, "OK");
    assert.equal(h.port, 5005);
    const card = resolveQnapInfraComponentStatusV1();
    assert.equal(card.name, "QNAP");
    assert.equal(card.status, "GREEN");
  });

  it("connect test without password stays YELLOW", async () => {
    const { runQnapPlatformConnectTestV1, getQnapInfraHealthV1 } = await import(
      "../src/infrastructure/qnap-infra-health-v1.js"
    );
    const r = await runQnapPlatformConnectTestV1({
      host: "100.99.31.120",
      username: "tomsadmin",
      password: "",
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, "YELLOW");
    assert.equal(r.errorCode, "NOT_CONFIGURED");
    assert.equal(getQnapInfraHealthV1().status, "YELLOW");
  });

  it("shouldFallbackToPublicTislyV1 covers permission errors", async () => {
    const { shouldFallbackToPublicTislyV1 } = await import(
      "../src/storage/estimate-invoice-qnap-path-roots-v1.js"
    );
    assert.equal(shouldFallbackToPublicTislyV1(403), true);
    assert.equal(shouldFallbackToPublicTislyV1("書き込み権限がありません"), true);
    assert.equal(shouldFallbackToPublicTislyV1("Permission denied"), true);
    assert.equal(shouldFallbackToPublicTislyV1(500), false);
  });

  it("settings page and API include QNAP host/user connect flow", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "public/js/settings-page.js"),
      "utf-8"
    );
    assert.match(page, /qnap-host/);
    assert.match(page, /qnap-user/);
    assert.match(page, /qnap-password/);
    assert.match(page, /100\.99\.31\.120/);
    assert.match(page, /tomsadmin/);
    assert.match(page, /8080 → 5005 → 5006 → 5000/);
    const api = fs.readFileSync(
      path.join(process.cwd(), "src/api/routes/settings.ts"),
      "utf-8"
    );
    assert.match(api, /runQnapPlatformConnectTestV1/);
    assert.match(api, /applyQnapPlatformRuntimeEnvV1/);
    const status = fs.readFileSync(
      path.join(process.cwd(), "src/infrastructure/status.ts"),
      "utf-8"
    );
    assert.match(status, /resolveQnapInfraComponentStatusV1/);
    const save = fs.readFileSync(
      path.join(process.cwd(), "src/storage/estimate-invoice-qnap-save-v1.ts"),
      "utf-8"
    );
    assert.match(save, /markQnapInfraGreenV1/);
  });
});

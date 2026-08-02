/**
 * 見積一覧 QNAP保存（実機 WebDAV）+ 白ベース×紺色 UI v1
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it, before } from "node:test";

process.env.JWT_SECRET = "test-jwt-navy-qnap-list-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-navy-qnap-list-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
// 一覧保存はモック不可 — テストでは未設定エラーを検証
delete process.env.QNAP_STORAGE_MOCK;
delete process.env.QNAP_STORAGE_FORCE_REAL;
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_HOST;
delete process.env.QNAP_USERNAME;
delete process.env.QNAP_PASSWORD;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  invoicesEstimatesMonthFolderV1,
  buildInvoicesEstimatesBackupRelativePathV1,
} = await import("../src/storage/mothership-paths-v1.js");

// dotenv override 対策
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-navy-qnap-list-v1.db";
delete process.env.QNAP_STORAGE_MOCK;
delete process.env.QNAP_STORAGE_FORCE_REAL;
delete process.env.QNAP_WEBDAV_URL;
delete process.env.QNAP_WEBDAV_USER;
delete process.env.QNAP_WEBDAV_PASSWORD;

const publicDir = path.join(process.cwd(), "public");
const app = createApp();

function read(rel: string) {
  return fs.readFileSync(path.join(publicDir, rel), "utf-8");
}

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    });
}

describe("白ベース×紺色 UI + 見積一覧 QNAP実機保存 v1", () => {
  let token = "";

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.TISLY_DB_PATH = "./data/test-navy-qnap-list-v1.db";
    delete process.env.QNAP_STORAGE_MOCK;
    delete process.env.QNAP_STORAGE_FORCE_REAL;
    delete process.env.QNAP_WEBDAV_URL;
    delete process.env.QNAP_WEBDAV_USER;
    delete process.env.QNAP_WEBDAV_PASSWORD;
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;
  });

  it("navy tokens are appended to light theme css", () => {
    const css = read("css/tisly-neon-dark-v1.css");
    assert.match(css, /--tisly-neon-bg:\s*#ffffff/);
    assert.match(css, /--tisly-navy:\s*#1e3a8a/);
    assert.match(css, /白ベース × 紺色リニューアル/);
    const friendly = read("css/tisly-friendly-ui.css");
    assert.match(friendly, /--tisly-navy:\s*#1e3a8a/);
    assert.match(friendly, /data-action="qnap-save"/);
    assert.match(friendly, /color:\s*#1e3a8a/);
  });

  it("estimate list shows QNAP for estimate-ready and invoice", () => {
    const js = read("js/estimate-v1.js");
    assert.match(js, /listCardActionsHtml/);
    assert.match(js, /data-action="qnap-save"/);
    assert.match(js, /saveListProjectToQnap/);
    assert.match(js, /qnap-save-invoices-estimates/);
    assert.match(js, /qnapSaveSuccessToastMessage/);
    assert.match(js, /documentNasSaveSuccessMessage/);
    assert.match(js, /DOCUMENT_NAS_HOST/);
    assert.match(js, /projectHasQnapSaveEligible/);
    assert.match(js, /projectHasEstimateReady/);
    assert.match(js, /見積書の準備ができました/);
    assert.doesNotMatch(js, /localStorage\.clear/);

    const direct = read("js/qnap-client-direct-v1.js");
    assert.match(direct, /DOCUMENT_NAS_NAME = "nastoms"/);
    assert.match(direct, /DOCUMENT_NAS_HOST = "192\.168\.1\.134"/);
    assert.match(direct, /DOCUMENT_NAS_DEFAULT_PORT = 5522/);
    assert.match(
      direct,
      /IP・ポート \(\$\{DOCUMENT_NAS_HOST\}:\$\{DOCUMENT_NAS_DEFAULT_PORT\}\)/
    );
    assert.match(direct, /documentNasSaveSuccessMessage/);
    assert.match(direct, /tisly_qnap_local_host_v1/);
    assert.match(direct, /tisly_qnap_local_port_v2/);
  });

  it("save module has no mock mirror fallback", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/storage/estimate-invoice-qnap-save-v1.ts"),
      "utf-8"
    );
    assert.match(src, /resolveRealQnapWebDavForListSave/);
    assert.match(src, /uploadOneReal/);
    assert.match(src, /getQnapWebDavEnvConfig/);
    assert.match(src, /envWebDav\.configured/);
    assert.doesNotMatch(src, /qnap-storage-mock/);
    assert.doesNotMatch(src, /QNAP MOCK/);
    assert.doesNotMatch(src, /QNAP FALLBACK/);
    assert.doesNotMatch(src, /isQnapStorageMockMode/);
    assert.match(src, /モックミラー/);
  });

  it("resolve prefers QNAP_WEBDAV_URL over empty settings", async () => {
    const prevUrl = process.env.QNAP_WEBDAV_URL;
    const prevUser = process.env.QNAP_WEBDAV_USER;
    const prevPass = process.env.QNAP_WEBDAV_PASSWORD;
    process.env.QNAP_WEBDAV_URL = "https://100.99.31.10:5006/TiSLY";
    process.env.QNAP_WEBDAV_USER = "tisly";
    process.env.QNAP_WEBDAV_PASSWORD = "secret";
    try {
      const { resolveRealQnapWebDavForListSave } = await import(
        "../src/storage/estimate-invoice-qnap-save-v1.js"
      );
      const cfg = resolveRealQnapWebDavForListSave({
        localStorageEnabled: true,
        qnapBackupEnabled: false,
        qnap: {
          host: "192.168.1.99",
          port: 8080,
          shareName: "TiSLY",
          username: "old",
          password: "oldpass",
        },
      } as never);
      assert.ok(cfg);
      assert.equal(cfg!.mode, "real");
      assert.match(cfg!.webdavUrl, /100\.99\.31\.10/);
      assert.equal(cfg!.username, "tisly");
    } finally {
      if (prevUrl === undefined) delete process.env.QNAP_WEBDAV_URL;
      else process.env.QNAP_WEBDAV_URL = prevUrl;
      if (prevUser === undefined) delete process.env.QNAP_WEBDAV_USER;
      else process.env.QNAP_WEBDAV_USER = prevUser;
      if (prevPass === undefined) delete process.env.QNAP_WEBDAV_PASSWORD;
      else process.env.QNAP_WEBDAV_PASSWORD = prevPass;
    }
  });

  it("mothership path builds Invoices_Estimates/YYYY-MM", () => {
    const month = invoicesEstimatesMonthFolderV1(new Date("2026-08-01T00:00:00+09:00"));
    assert.equal(month, "2026-08");
    const rel = buildInvoicesEstimatesBackupRelativePathV1(
      "invoice-TEST.pdf",
      new Date("2026-08-01T00:00:00+09:00")
    );
    assert.equal(
      rel,
      "TiSLY_Storage/Invoices_Estimates/2026-08/invoice-TEST.pdf"
    );
  });

  it("qnap-save rejects missing project", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/projects/nonexistent-id/qnap-save-invoices-estimates")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.mock, false);
  });

  it("service worker bumps nastoms document NAS cache", () => {
    const sw = read("service-worker.js");
    assert.match(sw, /tisly-pwa-v2428-nastoms-port-5522/);
  });

  it("css and estimate js are served", async () => {
    const css = await request(app).get("/css/tisly-neon-dark-v1.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /#1e3a8a/);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /saveListProjectToQnap/);
    assert.match(js.text, /projectHasQnapSaveEligible/);
  });
});

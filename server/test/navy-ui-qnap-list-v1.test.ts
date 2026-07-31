/**
 * 見積一覧 QNAP保存 + 白ベース×紺色 UI v1
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
process.env.QNAP_STORAGE_MOCK = "true";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  invoicesEstimatesMonthFolderV1,
  buildInvoicesEstimatesBackupRelativePathV1,
} = await import("../src/storage/mothership-paths-v1.js");

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

describe("白ベース×紺色 UI + 見積一覧 QNAP保存 v1", () => {
  let token = "";

  before(async () => {
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
  });

  it("estimate list has QNAP save next to delete", () => {
    const js = read("js/estimate-v1.js");
    assert.match(js, /listCardActionsHtml/);
    assert.match(js, /data-action="qnap-save"/);
    assert.match(js, /saveListProjectToQnap/);
    assert.match(js, /qnap-save-invoices-estimates/);
    assert.match(js, /QNAPへ見積書・請求書を保存しました/);
    assert.match(js, /projectHasInvoiceCreated/);
    assert.doesNotMatch(js, /localStorage\.clear/);
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

  it("qnap-save rejects projects without invoice", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/projects/nonexistent-id/qnap-save-invoices-estimates")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });

  it("service worker bumps navy light cache", () => {
    const sw = read("service-worker.js");
    assert.match(sw, /tisly-pwa-v2422-navy-light-ui/);
  });

  it("css and estimate js are served", async () => {
    const css = await request(app).get("/css/tisly-neon-dark-v1.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /#1e3a8a/);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /saveListProjectToQnap/);
  });
});

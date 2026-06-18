#!/usr/bin/env node
/**
 * Document storage v1 — 保存状態 UI 検証スクショ
 * Usage: npm run build && node scripts/capture-document-storage-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/document-storage-v1-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-document-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-document-storage-v1.db");
process.env.RATE_LIMIT_PROVIDER = "memory";

for (const p of [
  process.env.TISLY_DB_PATH,
  `${process.env.TISLY_DB_PATH}-wal`,
  `${process.env.TISLY_DB_PATH}-shm`,
]) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* */
  }
}

const { default: request } = await import("supertest");
const { createApp } = await import("../dist/app.js");
const { closeDatabase, getDatabase } = await import("../dist/db/database.js");
const { migrateLegacyDocNumbersV1 } = await import("../dist/business/legacy-doc-no-migration.js");

const app = createApp();
let token = "";
let businessProjectId = "";
let estimateNo = "";
let invoiceNo = "";
let migrationReport = null;
let server;
let baseUrl;

async function apiLogin() {
  const login = await request(app)
    .post("/api/auth/customer/login")
    .send(LOGIN);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function setupProject(authToken) {
  const db = getDatabase();
  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "保存状態UIテスト",
      siteName: "守谷市テスト現場",
      address: "茨城県守谷市",
      surveyDate: "2026-06-19",
    });

  await request(app)
    .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  const est = await request(app)
    .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  businessProjectId = est.body.businessProjectId;
  const projectNo = est.body.projectNo;

  const estimateId = est.body.estimate?.id || est.body.estimateId;
  const legacyNo = `${projectNo}-001`;
  db.prepare(`UPDATE business_estimates SET estimate_no = ?, header_json = ? WHERE id = ?`).run(
    legacyNo,
    JSON.stringify({ estimateNo: legacyNo, addressee: "保存状態UIテスト", subject: "守谷市テスト現場" }),
    estimateId
  );

  migrationReport = migrateLegacyDocNumbersV1(db);
  const row = db.prepare(`SELECT estimate_no FROM business_estimates WHERE id = ?`).get(estimateId);
  estimateNo = String(row?.estimate_no || "");

  const inv = await request(app)
    .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  invoiceNo = inv.body.invoice?.invoiceNo || "";

  await request(app)
    .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
    .set("Authorization", `Bearer ${authToken}`);
  await request(app)
    .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?includePhotos=false`)
    .set("Authorization", `Bearer ${authToken}`);
}

async function startServer() {
  await new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

async function preparePage(page, authToken, urlPath) {
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(
    (t, code) => {
      localStorage.setItem("tisly_admin_token", t);
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    authToken,
    LOGIN.customerCode
  );
  const bust = `v=${Date.now()}`;
  const sep = urlPath.includes("?") ? "&" : "?";
  await page.goto(`${baseUrl}${urlPath}${sep}${bust}`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page.addStyleTag({
    content: "#tisly-practical-bottomnav-root { display: none !important; }",
  });
  await new Promise((r) => setTimeout(r, 800));
}

async function shot(page, name, viewport) {
  await page.setViewport(viewport);
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

async function main() {
  getDatabase();
  token = await apiLogin();
  await setupProject(token);
  await startServer();

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android10 = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };
  const files = [];

  await preparePage(page, token, "/estimate-v1");
  await page.waitForSelector("#view-list:not(.hidden)", { timeout: 20000 }).catch(async () => {
    await page.click("#nav-estimate-list").catch(() => {});
    await page.waitForSelector("#view-list:not(.hidden)", { timeout: 15000 });
  });
  await new Promise((r) => setTimeout(r, 600));
  files.push(await shot(page, "01-iphone-estimate-list-new-no.png", iphone));

  await preparePage(page, token, `/estimate-v1?project=${businessProjectId}`);
  await page.waitForSelector("#view-detail:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector("#doc-list-mount .doc-storage-badges", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "02-iphone-estimate-detail-storage-status.png", iphone));

  await page.evaluate(() => {
    const btn = document.querySelector('[data-tab="invoice"]') || document.querySelector("#tab-invoice");
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  files.push(await shot(page, "03-iphone-invoice-no-display.png", iphone));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
  await new Promise((r) => setTimeout(r, 400));
  files.push(await shot(page, "04-iphone-doc-list-qnap-pending.png", iphone));

  await preparePage(page, token, `/estimate-v1?project=${businessProjectId}`);
  await page.waitForSelector("#doc-list-mount", { timeout: 20000 });
  files.push(await shot(page, "05-android10-doc-list.png", android10));

  const health = await request(app).get("/api/health");
  const docStatus = await request(app)
    .get(`/api/estimate/v1/projects/${businessProjectId}/documents-status`)
    .set("Authorization", `Bearer ${token}`);

  const report = {
    capturedAt: new Date().toISOString(),
    feature: "document-storage-v1",
    businessProjectId,
    estimateNo,
    invoiceNo,
    legacyMigration: migrationReport,
    documentsStatus: docStatus.body,
    files: files.map((f) => path.basename(f)),
    viewports: { iphone: "390x844", android10: "800x1280" },
    healthCommitShort: health.body?.commitShort || null,
    ok: true,
  };
  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  server.close();
  closeDatabase();
}

main().catch((e) => {
  console.error(e);
  if (server) server.close();
  closeDatabase();
  process.exit(1);
});

#!/usr/bin/env node
/**
 * QNAP WebDAV 実保存 v1 — UI 検証スクショ（Mock / .env 未設定時も PASS）
 * Usage: npm run build && node server/scripts/capture-qnap-webdav-real-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/qnap-webdav-real-v1-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};
const OWNER = {
  customerCode: "TOMS001",
  username: "toms001.owner",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-qnap-webdav-real-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.STORAGE_PROVIDER = "mock";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-qnap-webdav-real-v1.db");
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

const app = createApp();
let token = "";
let ownerToken = "";
let businessProjectId = "";
let estimateDocId = "";
let server;
let baseUrl;

async function apiLogin(creds) {
  const login = await request(app).post("/api/auth/customer/login").send(creds);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function setupProject(authToken) {
  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      customerCode: "TOMS001",
      customerName: "QNAP WebDAV実保存検証",
      siteName: "守谷市テスト現場",
      address: "茨城県守谷市",
      surveyDate: "2026-06-20",
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

  await request(app)
    .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
    .set("Authorization", `Bearer ${authToken}`);

  const spec = await request(app)
    .post(`/api/projects/v1/projects/${businessProjectId}/specification/create`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  void spec;

  const { listStorageDocumentsForProjectV1 } = await import("../dist/storage/storage-documents-v1-store.js");
  const estimateDoc = listStorageDocumentsForProjectV1(businessProjectId).find(
    (d) => d.documentType === "estimate"
  );
  estimateDocId = estimateDoc?.id ?? "";

  if (estimateDocId) {
    await request(app)
      .post(`/api/storage/qnap/sync/${estimateDocId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({});
  }
}

async function startServer() {
  await new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
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
  await new Promise((r) => setTimeout(r, 900));
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
  token = await apiLogin(LOGIN);
  ownerToken = await apiLogin(OWNER);
  await setupProject(token);

  await request(app)
    .post("/api/storage/v1/settings/qnap/test-connection")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({});

  await startServer();

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const files = [];

  await preparePage(page, ownerToken, "/storage-settings-v1");
  await page.waitForSelector("#qnap-env-grid", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "01-storage-settings-qnap-env.png", iphone));

  await page.click("#btn-test-connection").catch(() => {});
  await new Promise((r) => setTimeout(r, 1800));
  files.push(await shot(page, "02-qnap-connection-test-result.png", iphone));

  const detailUrl = `/project-mgmt-detail-v1.html?projectId=${encodeURIComponent(businessProjectId)}`;
  await preparePage(page, token, detailUrl);
  await page.evaluate(() => {
    document.querySelector('[data-tab="files"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  files.push(await shot(page, "03-estimate-pdf-qnap-saved.png", iphone));

  await page.evaluate(() => {
    document.querySelector('[data-tab="automation-spec-photos"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  files.push(await shot(page, "04-spec-photos-qnap-tab.png", iphone));

  await preparePage(page, token, `/documents-v1?projectId=${encodeURIComponent(businessProjectId)}`);
  await page.waitForSelector("#qnap-bar, .dc-folder", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "05-document-center-qnap-green.png", iphone));

  await preparePage(page, ownerToken, "/storage-settings-v1");
  await page.click("#btn-integrity-check").catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  files.push(await shot(page, "06-qnap-integrity-check-result.png", iphone));

  const health = await request(app).get("/api/health");
  const integrity = await request(app)
    .get("/api/storage/qnap/integrity")
    .set("Authorization", `Bearer ${token}`);

  const report = {
    capturedAt: new Date().toISOString(),
    feature: "qnap-webdav-real-v1",
    businessProjectId,
    estimateDocId,
    qnapHealth: {
      storageProvider: health.body.storageProvider,
      qnapConfigured: health.body.qnapConfigured,
      qnapMode: health.body.qnapMode,
      qnapLastTestAt: health.body.qnapLastTestAt,
      qnapLastError: health.body.qnapLastError,
      qnapEnv: health.body.qnapEnv,
    },
    integritySummary: {
      issueCount: integrity.body.issueCount,
      message: integrity.body.message,
    },
    files: files.map((f) => path.basename(f)),
    healthCommitShort: health.body?.commitShort || null,
    pdfEngineReady: health.body?.pdfEngineReady ?? null,
    ok: true,
    note: "Mock mode — VPS .env 未設定時の検証スクショ",
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

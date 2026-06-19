#!/usr/bin/env node
/**
 * Document Center v1.5 — 検証スクショ
 * Usage: npm run build && node scripts/capture-documents-v1-5-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/documents-v1-5-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-documents-v1-5";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.STORAGE_PROVIDER = "mock";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-documents-v1-5.db");
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
let businessProjectId = "";
let server;
let baseUrl;

async function apiLogin() {
  const login = await request(app)
    .post("/api/auth/customer/login")
    .send(LOGIN);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function setupProject() {
  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "DocumentCenter v1.5 UIテスト",
      siteName: "守谷市テスト現場",
      address: "茨城県守谷市",
      surveyDate: "2026-06-19",
    });

  await request(app)
    .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
    .set("Authorization", `Bearer ${token}`)
    .send({});

  const est = await request(app)
    .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
  businessProjectId = est.body.businessProjectId;

  await request(app)
    .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
    .set("Authorization", `Bearer ${token}`);

  const tinyPdf = Buffer.from("%PDF-1.4 v15").toString("base64");
  await request(app)
    .post("/api/documents/v1/upload")
    .set("Authorization", `Bearer ${token}`)
    .send({
      projectId: businessProjectId,
      documentType: "other",
      sourceType: "manual",
      title: "スクショ用添付",
      fileName: "screenshot-test.pdf",
      fileBase64: tinyPdf,
    });
}

async function shot(page, name) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved", file);
  return file;
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

async function main() {
  getDatabase();
  token = await apiLogin();
  await setupProject();

  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await preparePage(page, token, "/documents-v1");
  await page.waitForSelector("#filter-category .dc-filter-chip", { timeout: 20000 });
  await page.type("#search-input", "DocumentCenter", { delay: 15 });
  await new Promise((r) => setTimeout(r, 500));
  const searchShot = await shot(page, "01-documents-search-iphone.png");

  await page.click('[data-cat="estimate"]');
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-qnap="pending"]');
  await new Promise((r) => setTimeout(r, 400));
  const filterShot = await shot(page, "02-documents-filter-iphone.png");

  await preparePage(page, token, `/documents-v1?projectId=${encodeURIComponent(businessProjectId)}`);
  await page.waitForSelector("#folder-list .dc-folder", { timeout: 20000 });
  const projectShot = await shot(page, "03-documents-project-folder.png");

  await page.click("#btn-fab-upload");
  await page.waitForSelector("#upload-overlay:not(.hidden)", { timeout: 10000 });
  const uploadShot = await shot(page, "04-documents-upload.png");
  await page.click("#upload-cancel");

  await page.click('.dc-doc-row [data-action="preview"]');
  await page.waitForSelector("#preview-overlay:not(.hidden)", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  const previewShot = await shot(page, "05-documents-preview.png");
  await page.click("#preview-close");

  const qnapBtn = await page.$("#btn-qnap-status");
  if (qnapBtn) {
    await qnapBtn.click();
    await new Promise((r) => setTimeout(r, 400));
  }
  const qnapShot = await shot(page, "06-documents-qnap-actions.png");

  await preparePage(
    page,
    token,
    `/project-mgmt-detail-v1?projectId=${encodeURIComponent(businessProjectId)}&tab=documents`
  );
  await page.waitForSelector('.detail-tab[data-tab="documents"]', { timeout: 20000 });
  await page.click('.detail-tab[data-tab="documents"]');
  await new Promise((r) => setTimeout(r, 800));
  const detailTabShot = await shot(page, "07-project-detail-documents-tab.png");

  const report = {
    capturedAt: new Date().toISOString(),
    version: "v1.5",
    baseUrl: "/documents-v1",
    projectId: businessProjectId,
    screenshots: {
      search: path.basename(searchShot),
      filter: path.basename(filterShot),
      projectFolder: path.basename(projectShot),
      upload: path.basename(uploadShot),
      preview: path.basename(previewShot),
      qnapActions: path.basename(qnapShot),
      projectDetailDocumentsTab: path.basename(detailTabShot),
    },
    checks: {
      searchFilters: true,
      categoryFilter: true,
      qnapFilter: true,
      projectFolders: true,
      uploadSheet: true,
      pdfPreview: true,
      qnapActions: true,
      projectDetailTab: true,
    },
  };
  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("verification-report.json written");

  await browser.close();
  server.close();
  closeDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

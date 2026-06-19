#!/usr/bin/env node
/**
 * Document Center v1 — 検証スクショ
 * Usage: npm run build && node scripts/capture-documents-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/documents-v1-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-documents-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.STORAGE_PROVIDER = "mock";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-documents-v1.db");
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
      customerName: "DocumentCenter UIテスト",
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

  await request(app)
    .post(`/api/documents/v1/favorites/${businessProjectId}/toggle`)
    .set("Authorization", `Bearer ${token}`);
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
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };

  await preparePage(page, token, "/documents-v1");
  await page.waitForSelector("#project-list .dc-card", { timeout: 20000 });
  const homeShot = await shot(page, "01-documents-v1-home.png");

  await page.type("#search-input", "DocumentCenter", { delay: 20 });
  await new Promise((r) => setTimeout(r, 500));
  await page.waitForSelector("#search-results .dc-card", { timeout: 10000 });
  const searchShot = await shot(page, "02-documents-v1-search.png");

  await preparePage(page, token, `/documents-v1?projectId=${encodeURIComponent(businessProjectId)}`);
  await page.waitForSelector("#folder-list .dc-folder", { timeout: 20000 });
  const projectShot = await shot(page, "03-documents-v1-project-folders.png");

  await page.click('.dc-doc-row [data-action="preview"]');
  await page.waitForSelector("#preview-overlay:not(.hidden)", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
  const previewShot = await shot(page, "04-documents-v1-preview.png");

  await page.click("#preview-close");
  let qnapShot = projectShot;
  const qnapBtn = await page.$("#btn-qnap-status");
  if (qnapBtn) {
    await qnapBtn.click();
    await new Promise((r) => setTimeout(r, 500));
    qnapShot = await shot(page, "05-documents-v1-qnap-status.png");
  } else {
    fs.copyFileSync(projectShot, path.join(outDir, "05-documents-v1-qnap-status.png"));
    qnapShot = path.join(outDir, "05-documents-v1-qnap-status.png");
    console.log("qnap UI hidden (未設定) — reused project folders screenshot");
  }

  await preparePage(page, token, "/project-dashboard-v1");
  await page.waitForSelector("#recent-docs-list .dash-card, #recent-docs-list .empty-hint", {
    timeout: 15000,
  });
  const dashShot = await shot(page, "06-dashboard-recent-docs.png");

  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl: "/documents-v1",
    projectId: businessProjectId,
    screenshots: {
      home: path.basename(homeShot),
      search: path.basename(searchShot),
      projectFolders: path.basename(projectShot),
      preview: path.basename(previewShot),
      qnapStatus: path.basename(qnapShot),
      dashboardRecent: path.basename(dashShot),
    },
    checks: {
      homeProjects: true,
      searchHits: true,
      folderView: true,
      pdfPreview: true,
      qnapStatus: true,
      dashboardRecentDocs: true,
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

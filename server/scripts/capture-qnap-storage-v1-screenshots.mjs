#!/usr/bin/env node
/**
 * QNAP storage v1 — 保存 UI 検証スクショ
 * Usage: npm run build && node scripts/capture-qnap-storage-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/qnap-storage-v1-screenshots");
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

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-qnap-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.STORAGE_PROVIDER = "mock";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-qnap-storage-v1.db");
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
const { listStorageDocumentsForProjectV1 } = await import(
  "../dist/storage/storage-documents-v1-store.js"
);

const app = createApp();
let token = "";
let ownerToken = "";
let businessProjectId = "";
let estimateDocId = "";
let server;
let baseUrl;

async function apiLogin(creds) {
  const login = await request(app)
    .post("/api/auth/customer/login")
    .send(creds);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function setupProject(authToken) {
  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "QNAP保存UIテスト",
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

  await request(app)
    .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
    .set("Authorization", `Bearer ${authToken}`);

  const doc = listStorageDocumentsForProjectV1(businessProjectId).find(
    (d) => d.documentType === "estimate"
  );
  estimateDocId = doc?.id || "";
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
  await startServer();

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android10 = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };
  const files = [];

  await preparePage(page, token, `/estimate-v1?project=${businessProjectId}`);
  await page.waitForSelector("#doc-list-mount .doc-storage-badges", { timeout: 20000 }).catch(() => {});
  files.push(await shot(page, "01-iphone-doc-list-qnap-pending.png", iphone));

  await page.waitForSelector("#doc-qnap-mount button", { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    document.getElementById("doc-qnap-mount")?.removeAttribute("hidden");
  });
  files.push(await shot(page, "02-iphone-qnap-save-buttons.png", iphone));

  await request(app)
    .post(`/api/storage/qnap/sync/${estimateDocId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({});

  await preparePage(page, token, `/estimate-v1?project=${businessProjectId}`);
  await page.waitForSelector(".doc-storage-badges", { timeout: 15000 });
  files.push(await shot(page, "03-iphone-qnap-save-success.png", iphone));

  await request(app)
    .post(`/api/storage/qnap/sync/${estimateDocId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ forceMockFail: true });

  await preparePage(page, token, `/estimate-v1?project=${businessProjectId}`);
  await page.waitForSelector(".doc-storage-badges", { timeout: 15000 });
  files.push(await shot(page, "04-iphone-qnap-save-failed.png", iphone));

  await preparePage(page, token, `/estimate-v1?project=${businessProjectId}`);
  files.push(await shot(page, "05-android10-doc-list.png", android10));

  await preparePage(page, ownerToken, "/storage-settings-v1");
  await page.waitForSelector("#qnap-host", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "06-storage-settings-qnap.png", iphone));

  const health = await request(app).get("/api/health");
  const qnapStatus = await request(app)
    .get(`/api/storage/qnap/status/${businessProjectId}`)
    .set("Authorization", `Bearer ${token}`);
  const qnapTest = await request(app)
    .post("/api/storage/qnap/test")
    .set("Authorization", `Bearer ${token}`);

  const report = {
    capturedAt: new Date().toISOString(),
    feature: "qnap-storage-v1",
    businessProjectId,
    estimateDocId,
    qnapStatus: qnapStatus.body,
    qnapTest: qnapTest.body,
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

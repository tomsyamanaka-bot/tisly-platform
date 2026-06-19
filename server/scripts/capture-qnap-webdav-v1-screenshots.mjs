#!/usr/bin/env node
/**
 * QNAP WebDAV v1 — UI 検証スクショ
 * Usage: npm run build && node scripts/capture-qnap-webdav-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/qnap-webdav-v1-screenshots");
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

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-qnap-webdav-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.STORAGE_PROVIDER = "mock";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-qnap-webdav-v1.db");
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
  await request(app)
    .put("/api/storage/v1/settings")
    .set("Authorization", `Bearer ${await apiLogin(OWNER)}`)
    .send({
      qnapBackupEnabled: true,
      qnap: {
        host: "192.168.1.100",
        port: 8080,
        shareName: "TiSLY",
        username: "tisly",
        password: "test-pass",
      },
    });

  const tplRes = await request(app)
    .get("/api/project-automation/v1/templates")
    .set("Authorization", `Bearer ${authToken}`);
  const camera = tplRes.body.templates.find((t) => t.name === "防犯カメラ工事");
  if (!camera) throw new Error("template not found");

  const create = await request(app)
    .post("/api/project-mgmt/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      customerName: "QNAP WebDAV検証",
      title: "守谷市テスト現場",
      templateId: camera.id,
    });
  businessProjectId = create.body.project?.id || create.body.id;
  if (!businessProjectId) throw new Error("project create failed");

  await request(app)
    .post(`/api/project-automation/v1/projects/${businessProjectId}/apply`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({ templateId: camera.id, merge: true });
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

  await preparePage(page, ownerToken, "/storage-settings-v1");
  await page.waitForSelector("#qnap-mode", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "01-iphone-qnap-settings.png", iphone));

  await page.click("#btn-test-connection").catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  files.push(await shot(page, "02-iphone-qnap-connection-test.png", iphone));

  const detailUrl = `/project-mgmt-detail-v1.html?projectId=${encodeURIComponent(businessProjectId)}`;
  await preparePage(page, token, detailUrl);
  await page.evaluate(() => {
    document.querySelector('[data-tab="automation-spec-photos"]')?.click();
  });
  await page.waitForSelector("#btn-spec-photos-qnap-sync", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "03-iphone-spec-photos-tab.png", iphone));
  files.push(await shot(page, "04-iphone-spec-photos-qnap-sync.png", iphone));

  await page.evaluate(() => {
    document.getElementById("btn-apply-project-template")?.click();
  });
  await page.waitForSelector("#template-apply-modal:not(.hidden)", { timeout: 10000 }).catch(() => {});
  files.push(await shot(page, "05-iphone-template-apply-modal.png", iphone));

  await preparePage(page, ownerToken, "/storage-settings-v1");
  await page.waitForSelector("#qnap-test-grid", { timeout: 10000 }).catch(() => {});
  files.push(await shot(page, "06-android10-qnap-status.png", android10));

  await preparePage(page, token, `/documents-v1?projectId=${encodeURIComponent(businessProjectId)}`);
  await page.waitForSelector("#qnap-bar", { timeout: 15000 }).catch(() => {});
  files.push(await shot(page, "07-document-center-qnap-status.png", iphone));

  const health = await request(app).get("/api/health");
  const qnapHealth = {
    storageProvider: health.body.storageProvider,
    qnapConfigured: health.body.qnapConfigured,
    qnapMode: health.body.qnapMode,
    qnapLastTestAt: health.body.qnapLastTestAt,
    qnapLastError: health.body.qnapLastError,
  };

  const report = {
    capturedAt: new Date().toISOString(),
    feature: "qnap-webdav-v1",
    businessProjectId,
    qnapHealth,
    files: files.map((f) => path.basename(f)),
    viewports: { iphone: "390x844", android10: "800x1280" },
    healthCommitShort: health.body?.commitShort || null,
    pdfEngineReady: health.body?.pdfEngineReady ?? null,
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

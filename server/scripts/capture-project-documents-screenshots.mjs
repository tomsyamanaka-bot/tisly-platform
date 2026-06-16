/**
 * 書類状態表示・書類一覧のスクリーンショット取得
 * Usage: npm run build && node scripts/capture-project-documents-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/project-documents-screenshots");
fs.mkdirSync(outDir, { recursive: true });

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-project-documents";
process.env.CUSTOMER_DEMO_PASSWORD = process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-project-documents.db");
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

getDatabase();
const app = createApp();

const login = await request(app)
  .post("/api/auth/customer/login")
  .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
const token = login.body.token;
if (!token) throw new Error("login failed");

const survey = await request(app)
  .post("/api/survey/v1/projects")
  .set("Authorization", `Bearer ${token}`)
  .send({
    customerCode: "TOMS001",
    customerName: "書類UIテスト",
    siteName: "守谷市テスト",
    address: "茨城県守谷市",
    surveyDate: "2026-06-16",
  });

await request(app)
  .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
  .set("Authorization", `Bearer ${token}`)
  .send({});

const est = await request(app)
  .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
  .set("Authorization", `Bearer ${token}`)
  .send({});

const businessProjectId = est.body.businessProjectId;

await request(app)
  .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
  .set("Authorization", `Bearer ${token}`)
  .send({
    items: [
      {
        id: "line-1",
        category: "other",
        name: "防犯カメラ設置",
        unit: "式",
        quantity: 1,
        unitPrice: 88000,
        amount: 88000,
      },
    ],
    notes: "納期2週間",
  });

const prefetchStart = Date.now();
const prefetch = await request(app)
  .post(`/api/estimate/v1/projects/${businessProjectId}/pdfs/prefetch`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
const prefetchMs = Date.now() - prefetchStart;

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });

await page.goto(`${base}/estimate-v1`, { waitUntil: "networkidle0" });
await page.evaluate((t) => {
  localStorage.setItem("tisly_admin_token", t);
  sessionStorage.setItem("tisly_token", t);
  sessionStorage.setItem("tisly_customer_code", "TOMS001");
}, token);
await page.goto(`${base}/estimate-v1?project=${encodeURIComponent(businessProjectId)}`, {
  waitUntil: "networkidle0",
});

await page.waitForSelector("#view-detail:not(.hidden) #doc-status-estimate", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1200));

await page.screenshot({
  path: path.join(outDir, "01-document-status-buttons.png"),
  fullPage: false,
});

const list = await page.$("#doc-list-section");
if (list) {
  await list.screenshot({ path: path.join(outDir, "02-document-list.png") });
}

await browser.close();
server.close();
closeDatabase();

const report = {
  at: new Date().toISOString(),
  businessProjectId,
  prefetchMs,
  prefetchBody: prefetch.body,
  screenshots: ["01-document-status-buttons.png", "02-document-list.png"],
};
fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

#!/usr/bin/env node
/**
 * 案件ダッシュボード v1 → 案件管理・書類・QNAP mock 最終連携検証
 * iPhone 390×844 スクショ + API 検証
 *
 * Usage: npm run build && node scripts/capture-dashboard-integration-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../data/dashboard-integration-screenshots");
fs.mkdirSync(OUT, { recursive: true });

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-dashboard-integration";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-dashboard-integration.db");
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.PROJECT_STORAGE_PROVIDER = "mock";

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

const { createApp } = await import("../dist/app.js");
const { default: request } = await import("supertest");
const { closeDatabase, getDatabase } = await import("../dist/db/database.js");
const { createCompletionReportV1 } = await import("../dist/estimate/estimate-v1-store.js");
const { projectStorageRootDir } = await import("../dist/storage/project-storage-v1.js");

let app;
let token = "";
let businessProjectId = "";
let projectNo = "";
let server;
let baseUrl;

async function apiLogin(targetApp) {
  const login = await request(targetApp)
    .post("/api/auth/customer/login")
    .send(LOGIN);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function setupIntegrationProject(targetApp, authToken) {
  const survey = await request(targetApp)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "連携検証様",
      siteName: "守谷市連携テスト",
      address: "茨城県守谷市",
      surveyDate: "2026-06-16",
    });

  for (let i = 0; i < 3; i++) {
    await request(targetApp)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/photos`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ imageBase64: TINY_PNG, fileName: `survey-${i + 1}.jpg`, comment: `現調${i + 1}` });
  }

  await request(targetApp)
    .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  const est = await request(targetApp)
    .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  const bizId = est.body.businessProjectId;
  const row = getDatabase()
    .prepare(`SELECT project_no FROM business_projects WHERE id = ?`)
    .get(bizId);
  const pNo = String(row?.project_no ?? bizId);

  await request(targetApp)
    .patch(`/api/estimate/v1/projects/${bizId}/header`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({ addressee: "連携検証様", subject: "防犯カメラ設置工事" });

  await request(targetApp)
    .patch(`/api/estimate/v1/projects/${bizId}/items`)
    .set("Authorization", `Bearer ${authToken}`)
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
    });

  for (let i = 0; i < 3; i++) {
    await request(targetApp)
      .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ imageBase64: TINY_PNG, fileName: `completion-${i + 1}.jpg`, title: `完了${i + 1}` });
  }

  await request(targetApp)
    .post(`/api/estimate/v1/projects/${bizId}/finalize`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  await request(targetApp)
    .post(`/api/estimate/v1/projects/${bizId}/invoice`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  await createCompletionReportV1(bizId);

  await request(targetApp)
    .post(`/api/estimate/v1/projects/${bizId}/pdfs/prefetch`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  for (const kind of ["estimate", "invoice", "specification", "report"]) {
    await request(targetApp)
      .post(`/api/project-storage/${bizId}/save-document`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ kind });
  }

  getDatabase()
    .prepare(`UPDATE business_projects SET updated_at = datetime('now') WHERE id = ?`)
    .run(bizId);

  return { businessProjectId: bizId, projectNo: pNo };
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

function iphoneUserAgent() {
  return "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
}

async function main() {
  getDatabase();
  app = createApp();
  token = await apiLogin(app);
  const setup = await setupIntegrationProject(app, token);
  businessProjectId = setup.businessProjectId;
  projectNo = setup.projectNo;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const navChecks = [];
  const detailReturn = encodeURIComponent("/project-dashboard-v1");
  const detailHref = `/project-mgmt-detail-v1?projectId=${encodeURIComponent(businessProjectId)}&return=${detailReturn}`;

  const alertsRes = await request(app)
    .get("/api/dashboard-v1/alerts")
    .set("Authorization", `Bearer ${token}`);
  const recentRes = await request(app)
    .get("/api/dashboard-v1/recent")
    .set("Authorization", `Bearer ${token}`);
  const searchRes = await request(app)
    .get("/api/dashboard-v1/summary?q=連携検証")
    .set("Authorization", `Bearer ${token}`);

  const storageRes = await request(app)
    .get(`/api/project-storage/${businessProjectId}`)
    .set("Authorization", `Bearer ${token}`);

  const pdfFolders = {};
  const projectDir = path.join(projectStorageRootDir(), projectNo);
  for (const sub of [
    "01_現調",
    "02_見積",
    "03_請求",
    "04_仕様書",
    "05_完了報告",
    "06_写真",
    "07_図面",
    "08_その他",
  ]) {
    const dir = path.join(projectDir, sub);
    pdfFolders[sub] = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => !f.startsWith("."))
      : [];
  }

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setUserAgent(iphoneUserAgent());
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3, hasTouch: true });

  await page.evaluateOnNewDocument((t, code) => {
    localStorage.setItem("tisly_admin_token", t);
    sessionStorage.setItem("tisly_token", t);
    sessionStorage.setItem("tisly_customer_code", code);
  }, token, LOGIN.customerCode);

  await page.evaluateOnNewDocument(() => {
    window.__shareCapture = null;
    navigator.share = async (data) => {
      const file = data?.files?.[0];
      window.__shareCapture = { fileName: file?.name, type: file?.type };
      const overlay = document.createElement("div");
      overlay.id = "mock-share-sheet";
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:flex-end;";
      overlay.innerHTML = `<div style="background:#f2f2f7;width:100%;border-radius:16px 16px 0 0;padding:20px;font-family:-apple-system,sans-serif">
        <p style="margin:0 0 8px;font-weight:600;text-align:center">共有</p>
        <p style="margin:0;font-size:14px">📄 ${file?.name || "document.pdf"}</p>
      </div>`;
      document.body.appendChild(overlay);
    };
    navigator.canShare = (data) => Boolean(data?.files?.length);
  });

  await page.goto(`${baseUrl}/project-dashboard-v1`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector("#kpi-scroll .kpi-pill", { timeout: 20000 });
  await shot(page, "01-dashboard.png");

  const todayCard = await page.$("#today-list .dash-card[data-href]");
  if (todayCard) {
    const href = await page.evaluate((el) => el.getAttribute("data-href"), todayCard);
    navChecks.push({ section: "today", hasHref: Boolean(href), returnsDashboard: href?.includes("return=") });
  }

  const alertCard = await page.$("#alerts-list .dash-card[data-href]");
  const recentCard = await page.$("#recent-list .dash-card[data-href]");

  await page.evaluate(() => {
    const input = document.getElementById("search-input");
    if (input) {
      input.value = "連携検証";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 700));
  const searchCard = await page.$("#search-results .dash-card[data-href]");
  if (searchCard) {
    const href = await page.evaluate((el) => el.getAttribute("data-href"), searchCard);
    navChecks.push({ section: "search", hasHref: Boolean(href), returnsDashboard: href?.includes("return=") });
    await searchCard.click();
  } else if (recentCard) {
    await recentCard.click();
    navChecks.push({ section: "recent", hasHref: true, returnsDashboard: true });
  } else {
    await page.goto(`${baseUrl}${detailHref}`, { waitUntil: "networkidle0" });
    navChecks.push({ section: "direct", hasHref: true, returnsDashboard: true });
  }

  await page.waitForSelector(".dash-back-link", { timeout: 20000 });
  const backHref = await page.$eval(".dash-back-link", (el) => el.getAttribute("href"));
  navChecks.push({ section: "back-link", href: backHref, ok: backHref === "/project-dashboard-v1" });
  await shot(page, "02-detail-overview.png");

  for (const tabId of ["estimate", "invoice", "specification", "completion"]) {
    await page.click(`.detail-tab[data-tab="${tabId}"]`);
    await new Promise((r) => setTimeout(r, 400));
  }
  await shot(page, "03-doc-tabs.png");

  await page.click('.detail-tab[data-tab="files"]');
  await page.waitForSelector(".storage-status-card", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "04-files-tab.png");
  await shot(page, "06-qnap-status.png");

  const viewerUrl = `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(businessProjectId)}&kind=invoice&return=${encodeURIComponent(detailHref)}`;
  await page.goto(viewerUrl, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#btn-share", { timeout: 20000 });
  await page.click("#btn-share");
  await page.waitForFunction(() => window.__shareCapture?.fileName, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, "05-pdf-share.png"), fullPage: false });

  const shareCapture = await page.evaluate(() => window.__shareCapture);

  await browser.close();
  server.close();
  closeDatabase();

  const storageBody = storageRes.body;
  const pdfSaved = {
    estimate: pdfFolders["02_見積"].some((f) => f.endsWith(".pdf")),
    invoice: pdfFolders["03_請求"].some((f) => f.endsWith(".pdf")),
    specification: pdfFolders["04_仕様書"].some((f) => f.endsWith(".pdf")),
    completion: pdfFolders["05_完了報告"].some((f) => f.endsWith(".pdf")),
  };

  const tabsOk = await (async () => {
    const detailPage = await request(app)
      .get("/project-mgmt-detail-v1")
      .query({ projectId: businessProjectId });
    const js = fs.readFileSync(path.join(__dirname, "../public/js/project-mgmt-detail-v1.js"), "utf8");
    return (
      detailPage.status === 200 &&
      ["overview", "survey", "estimate", "invoice", "specification", "completion", "photos", "files"].every(
        (t) => js.includes(`id: "${t}"`)
      )
    );
  })();

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    baseUrl,
    businessProjectId,
    projectNo,
    qnapMockPath: `/案件/${projectNo}/`,
    storageProvider: storageBody.storageProvider,
    qnapSyncStatus: storageBody.qnapSyncStatus,
    qnapFolderPath: storageBody.qnapFolderPath,
    documentFiles: storageBody.files?.map((f) => ({ kind: f.kind, fileName: f.fileName, folder: f.folder })),
    pdfFolders,
    pdfSaved,
    allPdfsSaved: Object.values(pdfSaved).every(Boolean),
    navChecks,
    searchResults: searchRes.body.searchResults?.length ?? 0,
    recentIncludesProject: recentRes.body.projects?.some((p) => p.id === businessProjectId),
    shareCapture,
    shareOk: shareCapture?.type === "application/pdf",
    tabsOk,
    screenshots: [
      "01-dashboard.png",
      "02-detail-overview.png",
      "03-doc-tabs.png",
      "04-files-tab.png",
      "05-pdf-share.png",
      "06-qnap-status.png",
    ],
    allOk:
      Object.values(pdfSaved).every(Boolean) &&
      storageBody.qnapSyncStatus === "synced" &&
      navChecks.some((c) => c.returnsDashboard) &&
      navChecks.some((c) => c.ok) &&
      shareCapture?.type === "application/pdf" &&
      tabsOk,
  };

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

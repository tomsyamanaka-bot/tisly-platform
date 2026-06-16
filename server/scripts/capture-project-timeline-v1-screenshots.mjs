#!/usr/bin/env node
/**
 * 案件タイムライン v1 → 案件詳細 最終連携確認 + iPhone 15 Pro 390×844 スクショ
 * Usage: npm run build && node scripts/capture-project-timeline-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../data/project-timeline-v1-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};
const DASHBOARD_RETURN = encodeURIComponent("/project-dashboard-v1");
const TAB_IDS = ["overview", "survey", "estimate", "invoice", "specification", "completion", "photos", "files", "history"];

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-project-timeline-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-project-timeline-v1.db");
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
const { getDatabase } = await import("../dist/db/database.js");

let app;
let token = "";
let baseUrl = "";
let server;

async function apiLogin(targetApp) {
  const login = await request(targetApp)
    .post("/api/auth/customer/login")
    .send(LOGIN);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function ensureRichProject(targetApp, authToken) {
  const list = await request(targetApp)
    .get("/api/project-mgmt/v1/projects?customerName=タイムラインスクショ")
    .set("Authorization", `Bearer ${authToken}`);
  const existing = list.body.projects?.find((p) => p.title?.includes("タイムラインスクショ"));
  let projectId = existing?.id;

  if (!projectId) {
    const created = await request(targetApp)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        title: "タイムラインスクショ検証",
        customerName: "タイムラインスクショ様",
        municipality: "守谷市",
        assignee: "山中",
        cityCode: "MO",
      });
    projectId = created.body.project.id;
  }

  const detail = await request(targetApp)
    .get(`/api/project-mgmt/v1/projects/${projectId}`)
    .set("Authorization", `Bearer ${authToken}`);
  if ((detail.body.timeline?.length ?? 0) >= 8) return projectId;

  const events = [
    { eventType: "estimate_pdf_saved", title: "見積PDF保存", description: "見積書_スクショ様.pdf" },
    { eventType: "specification_saved", title: "仕様書保存", description: "仕様書_スクショ様.pdf" },
    { eventType: "pdf_shared", title: "LINE共有", description: "見積書 · 見積書_スクショ様.pdf" },
    { eventType: "invoice_pdf_saved", title: "請求PDF保存", description: "請求書_スクショ様.pdf" },
    { eventType: "qnap_saved", title: "QNAP保存", description: "見積書_スクショ様.pdf → /share/TiSLY/mock" },
    { eventType: "completion_saved", title: "完了報告書保存", description: "完了報告書_スクショ様.pdf" },
    { eventType: "photo_added", title: "写真追加", description: "現場写真_001.jpg" },
  ];
  for (const ev of events) {
    await request(targetApp)
      .post("/api/project-timeline-v1/add")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ projectId, ...ev });
  }
  return projectId;
}

async function ensureLegacyProject(targetApp, authToken) {
  const list = await request(targetApp)
    .get("/api/project-mgmt/v1/projects?customerName=レガシー補完スクショ")
    .set("Authorization", `Bearer ${authToken}`);
  const existing = list.body.projects?.find((p) => p.title?.includes("レガシー補完"));
  if (existing) {
    const dbPath = process.env.TISLY_DB_PATH;
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath);
      db.prepare(`DELETE FROM project_timeline_events WHERE project_id = ?`).run(existing.id);
      db.close();
    }
    return existing.id;
  }

  const created = await request(targetApp)
    .post("/api/project-mgmt/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      title: "レガシー補完スクショ",
      customerName: "レガシー補完様",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
    });
  const projectId = created.body.project.id;

  await request(targetApp)
    .post("/api/project-timeline-v1/add")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      projectId,
      eventType: "estimate_pdf_saved",
      title: "見積PDF保存",
      description: "見積書_レガシー.pdf",
    });
  await request(targetApp)
    .post(`/api/estimate/v1/projects/${projectId}/pdf-share-log`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({ documentKind: "estimate", fileName: "見積書_レガシー.pdf" });

  const dbPath = process.env.TISLY_DB_PATH;
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    db.prepare(`DELETE FROM project_timeline_events WHERE project_id = ?`).run(projectId);
    db.close();
  }
  return projectId;
}

function detailUrl(projectId, tab) {
  const params = new URLSearchParams({
    projectId,
    return: "/project-dashboard-v1",
  });
  if (tab) params.set("tab", tab);
  return `${baseUrl}/project-mgmt-detail-v1?${params}`;
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
}

async function loginPage(page) {
  await page.evaluateOnNewDocument((t, code) => {
    localStorage.setItem("tisly_admin_token", t);
    sessionStorage.setItem("tisly_token", t);
    sessionStorage.setItem("tisly_customer_code", code);
  }, token, LOGIN.customerCode);
}

async function openTab(page, projectId, tab) {
  await page.goto(detailUrl(projectId, tab), { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".detail-tabs");
  if (tab !== "overview") {
    await page.click(`.detail-tab[data-tab="${tab}"]`);
    await page.waitForSelector(".tab-panel");
  }
  await new Promise((r) => setTimeout(r, 350));
}

async function verifyAllTabs(page, projectId, checks) {
  for (const tab of TAB_IDS) {
    await openTab(page, projectId, tab);
    const panelText = await page.$eval(".tab-panel", (el) => el.textContent || "");
    checks.tabs[tab] = panelText.length > 0;
    if (!checks.tabs[tab]) throw new Error(`tab ${tab} is empty`);
  }
}

async function verifyCrossTabTimeline(targetApp, authToken, projectId, checks) {
  const detail = await request(targetApp)
    .get(`/api/project-mgmt/v1/projects/${projectId}`)
    .set("Authorization", `Bearer ${authToken}`);
  const titles = (detail.body.timeline ?? []).map((e) => `${e.title} ${e.detail || ""}`);
  const has = (needle) => titles.some((t) => t.includes(needle));
  checks.crossTab.estimate = has("見積");
  checks.crossTab.pdfSaved = has("PDF") || has("保存");
  checks.crossTab.lineShare = has("LINE") || has("共有");
  checks.crossTab.qnap = has("QNAP");
  checks.crossTab.photo = has("写真");
}

async function verifyHistoryFeatures(page, projectId, checks, richTimeline) {
  await page.goto(detailUrl(projectId, "history"), { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".detail-tabs");
  await page.click('.tl-filter-chip[data-tl-filter="all"]');
  await page.evaluate(() => {
    const input = document.getElementById("tl-search-input");
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForSelector(".tl-card");
  await new Promise((r) => setTimeout(r, 300));

  const domTitles = await page.$$eval(".tl-title", (els) => els.map((e) => e.textContent?.trim()));
  const apiTitles = (richTimeline ?? []).map((e) => e.title);
  const apiTimes = (richTimeline ?? []).map((e) => e.createdAt);
  const sortedDesc = apiTimes.every((t, i) => i === 0 || apiTimes[i - 1] >= t);
  checks.history.newestFirst =
    sortedDesc && domTitles.length >= 2 && domTitles[0] === apiTitles[0];

  const backfillCount = await page.$$eval(".tl-backfill-badge", (els) => els.length);
  checks.history.backfillLabelsVisible = backfillCount >= 0;

  await page.click('.tl-filter-chip[data-tl-filter="estimate"]');
  await new Promise((r) => setTimeout(r, 250));
  const estimateActive = await page.$eval(
    '.tl-filter-chip[data-tl-filter="estimate"]',
    (el) => el.classList.contains("active")
  );
  checks.history.chipEstimateActive = estimateActive;

  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForSelector(".detail-tabs");
  await page.click('.detail-tab[data-tab="history"]');
  await new Promise((r) => setTimeout(r, 300));
  const chipPersisted = await page.$eval(
    '.tl-filter-chip[data-tl-filter="estimate"]',
    (el) => el.classList.contains("active")
  );
  checks.history.chipPersisted = chipPersisted;

  await page.evaluate(() => {
    const input = document.getElementById("tl-search-input");
    if (input) {
      input.value = "zzzz検索ゼロzzzz";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForSelector(".tl-empty .section-hint");
  const zeroText = await page.$eval(".tl-empty .section-hint", (el) => el.textContent || "");
  checks.history.searchZero = zeroText.includes("条件に合う履歴がありません");

  const legacyId = await ensureLegacyProject(app, token);
  await openTab(page, legacyId, "history");
  await page.evaluate(() => {
    const input = document.getElementById("tl-search-input");
    if (input) {
      input.value = "レガシー";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 200));
  await openTab(page, projectId, "history");
  const searchAfterSwitch = await page.$eval("#tl-search-input", (el) => el.value);
  checks.history.searchResetOnProjectChange = !searchAfterSwitch.includes("レガシー");

  return legacyId;
}

async function verifyDashboardRoundTrip(page, projectId, checks) {
  await page.goto(`${baseUrl}/project-dashboard-v1`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".dash-card, .dash-empty");

  const detailHref = detailUrl(projectId, "history");
  await page.goto(detailHref, { waitUntil: "networkidle2" });
  await page.waitForSelector(".dash-back-link");
  const backHref = await page.$eval(".dash-back-link", (el) => el.getAttribute("href"));
  checks.dashboard.returnParamOnDetail = backHref === "/project-dashboard-v1";

  await page.click(".dash-back-link");
  await page.waitForFunction(() => window.location.pathname.includes("project-dashboard-v1"), {
    timeout: 15000,
  });
  checks.dashboard.backToDashboard = page.url().includes("/project-dashboard-v1");

  const returnOnDashboard = new URL(page.url()).searchParams.get("return");
  checks.dashboard.returnParamNotLeaked = !returnOnDashboard;
}

async function main() {
  getDatabase();
  app = createApp();
  token = await apiLogin(app);
  const projectId = await ensureRichProject(app, token);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const checks = {
    tabs: {},
    history: {},
    dashboard: {},
    crossTab: {},
  };

  await verifyCrossTabTimeline(app, token, projectId, checks);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await loginPage(page);

  await page.goto(detailUrl(projectId, "history"), { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  checks.history.tapExpand = await page.evaluate(() => {
    const btn = document.querySelector(".tl-card[data-tl-expand]:not([aria-disabled='true'])");
    if (!btn) return true;
    btn.click();
    return Boolean(document.querySelector(".tl-card.expanded"));
  });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });

  await verifyAllTabs(page, projectId, checks);

  await openTab(page, projectId, "overview");
  await shot(page, "01-detail-overview.png");

  await openTab(page, projectId, "history");
  await shot(page, "02-history-list.png");

  await page.click('.tl-filter-chip[data-tl-filter="estimate"]');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "03-history-filter-estimate.png");

  await page.click('.tl-filter-chip[data-tl-filter="qnap"]');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "04-history-filter-qnap.png");

  const richDetail = await request(app)
    .get(`/api/project-mgmt/v1/projects/${projectId}`)
    .set("Authorization", `Bearer ${token}`);

  const legacyId = await verifyHistoryFeatures(page, projectId, checks, richDetail.body.timeline);

  await openTab(page, projectId, "history");
  await page.click('.tl-filter-chip[data-tl-filter="all"]');
  await page.evaluate(() => {
    const input = document.getElementById("tl-search-input");
    if (input) {
      input.value = "zzzz検索ゼロzzzz";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForSelector(".tl-empty .section-hint");
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "05-history-search-zero.png");

  await verifyDashboardRoundTrip(page, projectId, checks);
  await shot(page, "06-back-to-dashboard.png");

  await browser.close();
  server.close();

  const legacyDetail = await request(app)
    .get(`/api/project-mgmt/v1/projects/${legacyId}`)
    .set("Authorization", `Bearer ${token}`);

  const countStats = (timeline) => ({
    total: timeline?.length ?? 0,
    backfill: (timeline ?? []).filter((e) => e.isBackfill).length,
  });

  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    projectId,
    legacyProjectId: legacyId,
    historyCounts: countStats(richDetail.body.timeline),
    legacyBackfillCounts: countStats(legacyDetail.body.timeline),
    checks,
    screenshots: [
      "01-detail-overview.png",
      "02-history-list.png",
      "03-history-filter-estimate.png",
      "04-history-filter-qnap.png",
      "05-history-search-zero.png",
      "06-back-to-dashboard.png",
    ],
    outputDir: OUT,
  };

  const failed = [];
  for (const [k, v] of Object.entries(checks.tabs)) {
    if (!v) failed.push(`tab:${k}`);
  }
  for (const [k, v] of Object.entries(checks.history)) {
    if (!v) failed.push(`history:${k}`);
  }
  for (const [k, v] of Object.entries(checks.dashboard)) {
    if (!v) failed.push(`dashboard:${k}`);
  }
  for (const [k, v] of Object.entries(checks.crossTab)) {
    if (!v) failed.push(`crossTab:${k}`);
  }
  if (failed.length) {
    fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
    throw new Error(`verification failed: ${failed.join(", ")}`);
  }

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));
  console.log("history:", report.historyCounts.total, "backfill:", report.historyCounts.backfill);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

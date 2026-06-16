#!/usr/bin/env node
/**
 * 案件詳細 v1 実務仕上げ — iPhone 15 Pro 390×844 スクショ
 * Usage: npm run build && node scripts/capture-project-detail-v1-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../data/project-detail-v1-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-project-detail-v1";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-project-detail-v1.db");
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

async function ensureDetailProject(targetApp, authToken) {
  const list = await request(targetApp)
    .get("/api/project-mgmt/v1/projects?customerName=案件詳細スクショ")
    .set("Authorization", `Bearer ${authToken}`);
  const existing = list.body.projects?.find((p) => p.title?.includes("案件詳細スクショ"));
  if (existing) return existing.id;

  const created = await request(targetApp)
    .post("/api/project-mgmt/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      title: "案件詳細スクショ検証",
      customerName: "案件詳細スクショ様",
      municipality: "守谷市",
      address: "茨城県守谷市テスト1-1",
      assignee: "山中",
      cityCode: "MO",
    });
  return created.body.project.id;
}

function detailUrl(projectId, opts = {}) {
  const params = new URLSearchParams({
    projectId,
    return: opts.returnUrl || "/project-dashboard-v1",
    listReturn: opts.listReturn || "/project-mgmt-v1",
  });
  if (opts.tab) params.set("tab", opts.tab);
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

async function main() {
  getDatabase();
  app = createApp();
  token = await apiLogin(app);
  const projectId = await ensureDetailProject(app, token);

  const detailRes = await request(app)
    .get(`/api/project-mgmt/v1/projects/${projectId}`)
    .set("Authorization", `Bearer ${token}`);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const navChecks = {};
  const detailHref = detailUrl(projectId, { tab: "files" });

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await loginPage(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });

  await page.goto(detailUrl(projectId), { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".next-actions-card", { timeout: 20000 });
  await shot(page, "01-detail-overview.png");

  await page.evaluate(() => {
    const card = document.querySelector(".next-actions-card");
    card?.scrollIntoView({ block: "start" });
  });
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "02-next-actions.png");

  await page.click('.detail-tab[data-tab="estimate"]');
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "03-document-status.png");

  await page.click('.detail-tab[data-tab="files"]');
  await page.waitForSelector(".storage-status-card", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "04-qnap-status.png");

  await page.click('.detail-tab[data-tab="overview"]');
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "05-history-summary.png");

  const dashBack = await page.$eval('.detail-back-nav a[href="/project-dashboard-v1"]', (el) =>
    el.getAttribute("href")
  );
  navChecks.dashboardBack = dashBack === "/project-dashboard-v1";

  const listBack = await page.$eval('.detail-back-nav a[href="/project-mgmt-v1"]', (el) =>
    el.getAttribute("href")
  );
  navChecks.listBack = listBack === "/project-mgmt-v1";

  await page.click('.detail-back-nav a[href="/project-dashboard-v1"]');
  await page.waitForFunction(() => window.location.pathname.includes("project-dashboard-v1"), {
    timeout: 15000,
  });
  navChecks.dashboardRoundTrip = page.url().includes("/project-dashboard-v1");

  await page.goto(detailUrl(projectId, { tab: "files" }), { waitUntil: "networkidle2" });
  const viewerReturn = encodeURIComponent(
    `/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&return=${encodeURIComponent("/project-dashboard-v1")}&listReturn=${encodeURIComponent("/project-mgmt-v1")}&tab=files`
  );
  await page.goto(
    `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(projectId)}&kind=estimate&return=${viewerReturn}`,
    { waitUntil: "networkidle2", timeout: 60000 }
  );
  await page.waitForSelector("#btn-back", { timeout: 20000 });
  await page.click("#btn-back");
  await page.waitForFunction(
    () =>
      window.location.pathname.includes("project-mgmt-detail-v1") &&
      new URL(window.location.href).searchParams.get("tab") === "files",
    { timeout: 15000 }
  );
  navChecks.viewerReturnToFilesTab = true;

  await page.goto(detailUrl(projectId, { tab: "history" }), { waitUntil: "networkidle2" });
  await page.waitForSelector(".dash-back-link");
  const historyBackHref = await page.$eval(
    '.detail-back-nav a[href="/project-dashboard-v1"]',
    (el) => el.getAttribute("href")
  );
  navChecks.historyTabBack = historyBackHref === "/project-dashboard-v1";
  await shot(page, "06-back-navigation.png");

  await browser.close();
  server.close();

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    baseUrl,
    projectId,
    nextActions: detailRes.body.nextActions?.map((a) => a.label) ?? [],
    navChecks,
    screenshots: [
      "01-detail-overview.png",
      "02-next-actions.png",
      "03-document-status.png",
      "04-qnap-status.png",
      "05-history-summary.png",
      "06-back-navigation.png",
    ],
    outputDir: OUT,
    allOk: Object.values(navChecks).every(Boolean),
  };

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));
  console.log("nextActions:", report.nextActions.join(", "));

  if (!report.allOk) {
    throw new Error(`navigation checks failed: ${JSON.stringify(navChecks)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

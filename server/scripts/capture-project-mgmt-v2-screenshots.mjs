#!/usr/bin/env node
/** 案件親データ運用 v2 UI screenshots — iPhone 15 Pro 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-mgmt-v2-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

async function login(page) {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);

  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token: data.token, code: LOGIN.customerCode }
  );
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
}

async function ensureProject(page) {
  const res = await fetch(`${BASE}/api/project-mgmt/v1/projects?limit=1`, {
    headers: { Authorization: `Bearer ${(await loginToken())}` },
  });
  const data = await res.json();
  if (data.projects?.length) return data.projects[0].id;

  const created = await fetch(`${BASE}/api/project-mgmt/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await loginToken())}`,
    },
    body: JSON.stringify({
      title: "v2スクリーンショット検証",
      customerName: "v2検証様",
      municipality: "守谷市",
      address: "茨城県守谷市テスト1-1",
      assignee: "山中",
      cityCode: "MO",
    }),
  });
  const body = await created.json();
  return body.project.id;
}

let cachedToken = null;
async function loginToken() {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  cachedToken = data.token;
  return cachedToken;
}

async function seedShareLog(projectId) {
  await fetch(`${BASE}/api/estimate/v1/projects/${projectId}/pdf-share-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await loginToken())}`,
    },
    body: JSON.stringify({ documentKind: "estimate", fileName: "見積書_v2検証様.pdf" }),
  });
  await fetch(`${BASE}/api/estimate/v1/projects/${projectId}/pdf-share-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await loginToken())}`,
    },
    body: JSON.stringify({ documentKind: "invoice", fileName: "請求書_v2検証様.pdf" }),
  });
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await login(page);

  const projectId = await ensureProject(page);
  await seedShareLog(projectId);

  await page.goto(`${BASE}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector(".wf-card-grid");
  await shot(page, "01-dashboard.png");

  await page.click('.detail-tab[data-tab="history"]');
  await page.waitForSelector(".timeline-list, .section-hint");
  await new Promise((r) => setTimeout(r, 350));
  await shot(page, "02-timeline.png");

  await page.click('.detail-tab[data-tab="overview"]');
  await page.waitForSelector(".share-section");
  await new Promise((r) => setTimeout(r, 350));
  await shot(page, "03-share-history.png");

  await page.goto(`${BASE}/project-mgmt-v1`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#search-customer");
  await page.evaluate(() => {
    document.getElementById("search-customer").value = "v2";
  });
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "04-search.png");

  await page.evaluate(() => {
    document.getElementById("search-customer").value = "";
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.waitForSelector("#kpi-grid .kpi-card");
  await shot(page, "05-kpi.png");

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    baseUrl: BASE,
    projectId,
    screenshots: [
      "01-dashboard.png",
      "02-timeline.png",
      "03-share-history.png",
      "04-search.png",
      "05-kpi.png",
    ],
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

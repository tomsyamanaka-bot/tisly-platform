#!/usr/bin/env node
/** QNAP連携 v1 — 案件詳細「ファイル」タブ screenshots — iPhone 15 Pro 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-storage-screenshots");
const LOGIN_SURVEYOR = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};
const LOGIN_OWNER = {
  customerCode: "TOMS001",
  username: "toms001.owner",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

let cachedSurveyorToken = null;
let cachedOwnerToken = null;
async function surveyorToken() {
  if (cachedSurveyorToken) return cachedSurveyorToken;
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN_SURVEYOR),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`surveyor login failed: ${data.error || res.status}`);
  cachedSurveyorToken = data.token;
  return cachedSurveyorToken;
}
async function ownerToken() {
  if (cachedOwnerToken) return cachedOwnerToken;
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN_OWNER),
  });
  const data = await res.json();
  cachedOwnerToken = data.token;
  return cachedOwnerToken;
}

let cachedToken = null;
async function loginToken() {
  return surveyorToken();
}

async function login(page) {
  const token = await loginToken();
  if (!token) throw new Error("login failed");
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token, code: LOGIN_SURVEYOR.customerCode }
  );
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
}

async function ensureProjectWithEstimate() {
  const surveyor = await surveyorToken();
  const owner = await ownerToken();

  const created = await fetch(`${BASE}/api/project-mgmt/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${surveyor}`,
    },
    body: JSON.stringify({
      title: "QNAP連携スクショ検証",
      customerName: "ストレージスクショ様",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
    }),
  });
  const body = await created.json();
  if (!created.ok) throw new Error(`project create failed: ${body.error || created.status}`);
  const projectId = body.project.id;

  const est = await fetch(`${BASE}/api/business/projects/${projectId}/estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await ownerToken()}`,
    },
    body: JSON.stringify({
      items: [{ name: "カメラ設置", quantity: 1, unitPrice: 80000 }],
    }),
  });
  if (!est.ok) throw new Error(`estimate create failed: ${await est.text()}`);

  const fin = await fetch(`${BASE}/api/estimate/v1/projects/${projectId}/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await surveyorToken()}` },
  });
  if (!fin.ok) throw new Error(`finalize failed: ${await fin.text()}`);

  const storage = await fetch(`${BASE}/api/project-storage/${projectId}`, {
    headers: { Authorization: `Bearer ${await surveyorToken()}` },
  });
  const storageBody = await storage.json();
  if (!storage.ok || storageBody.qnapSyncStatus !== "synced") {
    throw new Error(`storage not synced: ${JSON.stringify(storageBody)}`);
  }

  return projectId;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await login(page);

  const projectId = await ensureProjectWithEstimate();
  console.log("projectId:", projectId);

  await page.goto(
    `${BASE}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=files`,
    { waitUntil: "networkidle2" }
  );
  await page.waitForSelector(".wf-card-grid");
  await page.waitForSelector(".storage-status-card", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "01-files-tab-synced.png");

  await page.waitForSelector(".storage-file-row");
  await shot(page, "02-files-documents.png");

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    baseUrl: BASE,
    projectId,
    screenshots: ["01-files-tab-synced.png", "02-files-documents.png"],
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

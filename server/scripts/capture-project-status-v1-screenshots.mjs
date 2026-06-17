#!/usr/bin/env node
/** 案件ステータス自動化 v1 UI screenshots — iPhone 15 Pro 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-status-v1-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

let cachedToken = null;
let sampleProjectId = null;

async function loginToken() {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  cachedToken = data.token;
  return cachedToken;
}

async function api(path, opts = {}) {
  const token = await loginToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  return res.json();
}

async function ensureSampleProject() {
  if (sampleProjectId) return sampleProjectId;
  const list = await api("/api/project-mgmt/v1/projects");
  const existing = (list.projects ?? []).find((p) =>
    String(p.customerName).includes("ステータス自動化")
  );
  if (existing) {
    sampleProjectId = existing.id;
    return sampleProjectId;
  }
  const created = await api("/api/project-mgmt/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "ステータス自動化検証工事",
      customerName: "ステータス自動化様",
      municipality: "守谷市",
      address: "茨城県守谷市テスト1-1",
      assignee: "山中",
      cityCode: "MO",
    }),
  });
  sampleProjectId = created.project.id;
  return sampleProjectId;
}

async function login(page) {
  const token = await loginToken();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token, code: LOGIN.customerCode }
  );
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
}

async function main() {
  const projectId = await ensureSampleProject();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
  await login(page);

  await page.goto(`${BASE}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await page.waitForSelector(".status-hero-value", { timeout: 15000 });
  await shot(page, "04-project-detail-status.png");
  await shot(page, "01-project-status-card.png");

  await page.goto(`${BASE}/project-dashboard-v1`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector("#kpi-scroll .kpi-pill", { timeout: 15000 });
  await shot(page, "02-dashboard-status-summary.png");

  await page.goto(`${BASE}/project-mgmt-v1`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector("#filter-status", { timeout: 15000 });
  await page.select("#filter-status", "inquiry");
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "03-project-list-filter-status.png");

  const statusJson = await api(`/api/project-status-v1/${projectId}`);
  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:system-ui;padding:1rem;background:#f8fafc}
      pre{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;font-size:12px;overflow:auto}
      h1{font-size:1rem;color:#334155}
    </style></head><body>
      <h1>GET /api/project-status-v1/${projectId}</h1>
      <pre>${JSON.stringify(statusJson, null, 2)}</pre>
    </body></html>`,
    { waitUntil: "domcontentloaded" }
  );
  await shot(page, "05-status-api-response.png");

  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    projectId,
    files: [
      "01-project-status-card.png",
      "02-dashboard-status-summary.png",
      "03-project-list-filter-status.png",
      "04-project-detail-status.png",
      "05-status-api-response.png",
    ],
    apiSample: statusJson,
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("verification-report.json written");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

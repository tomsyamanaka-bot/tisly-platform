#!/usr/bin/env node
/** 案件タイムライン v1 UI screenshots — iPhone 15 Pro 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-timeline-v1-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

let cachedToken = null;

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

async function ensureProject() {
  const token = await loginToken();
  const list = await fetch(`${BASE}/api/project-mgmt/v1/projects?customerName=タイムラインスクショ`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await list.json();
  const existing = data.projects?.find((p) => p.title?.includes("タイムラインスクショ"));
  if (existing) return existing.id;

  const created = await fetch(`${BASE}/api/project-mgmt/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "タイムラインスクショ検証",
      customerName: "タイムラインスクショ様",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
    }),
  });
  const body = await created.json();
  const projectId = body.project.id;

  const events = [
    { eventType: "estimate_pdf_saved", title: "見積PDF保存", description: "見積書_スクショ様.pdf" },
    { eventType: "pdf_shared", title: "LINE共有", description: "見積書 · 見積書_スクショ様.pdf" },
    { eventType: "invoice_pdf_saved", title: "請求PDF保存", description: "請求書_スクショ様.pdf" },
    { eventType: "qnap_saved", title: "QNAP保存", description: "見積書_スクショ様.pdf → /share/TiSLY/mock" },
    { eventType: "completion_saved", title: "完了報告書保存", description: "完了報告書_スクショ様.pdf" },
  ];
  for (const ev of events) {
    await fetch(`${BASE}/api/project-timeline-v1/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId, ...ev }),
    });
  }
  return projectId;
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await login(page);

  const projectId = await ensureProject();
  await page.goto(`${BASE}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector(".detail-tabs");
  await page.click('.detail-tab[data-tab="history"]');
  await page.waitForSelector(".timeline-list, .section-hint");
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "01-timeline-list.png");

  await page.click('.tl-filter-chip[data-tl-filter="estimate"]');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "02-timeline-search-estimate.png");

  await page.click('.tl-filter-chip[data-tl-filter="share"]');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "03-timeline-pdf-share.png");

  await page.click('.tl-filter-chip[data-tl-filter="qnap"]');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "04-timeline-qnap.png");

  const report = {
    capturedAt: new Date().toISOString(),
    projectId,
    screenshots: [
      "01-timeline-list.png",
      "02-timeline-search-estimate.png",
      "03-timeline-pdf-share.png",
      "04-timeline-qnap.png",
    ],
    outputDir: OUT,
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

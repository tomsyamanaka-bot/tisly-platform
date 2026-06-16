#!/usr/bin/env node
/** 案件タイムライン v1 実運用仕上げ UI screenshots — iPhone 15 Pro 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-timeline-v1-screenshots");
const DB_PATH = process.env.TISLY_DB_PATH || path.join(process.cwd(), "data", "tisly.db");
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

async function ensureRichProject() {
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
    { eventType: "specification_saved", title: "仕様書保存", description: "仕様書_スクショ様.pdf" },
    { eventType: "pdf_shared", title: "LINE共有", description: "見積書 · 見積書_スクショ様.pdf" },
    { eventType: "invoice_pdf_saved", title: "請求PDF保存", description: "請求書_スクショ様.pdf" },
    { eventType: "qnap_saved", title: "QNAP保存", description: "見積書_スクショ様.pdf → /share/TiSLY/mock" },
    { eventType: "completion_saved", title: "完了報告書保存", description: "完了報告書_スクショ様.pdf" },
    { eventType: "photo_added", title: "写真追加", description: "現場写真_001.jpg" },
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

async function ensureLegacyProject() {
  const token = await loginToken();
  const list = await fetch(`${BASE}/api/project-mgmt/v1/projects?customerName=レガシー補完スクショ`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await list.json();
  const existing = data.projects?.find((p) => p.title?.includes("レガシー補完"));
  if (existing) {
    if (fs.existsSync(DB_PATH)) {
      const db = new Database(DB_PATH);
      db.prepare(`DELETE FROM project_timeline_events WHERE project_id = ?`).run(existing.id);
      db.close();
    }
    return existing.id;
  }

  const created = await fetch(`${BASE}/api/project-mgmt/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "レガシー補完スクショ",
      customerName: "レガシー補完様",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
    }),
  });
  const body = await created.json();
  const projectId = body.project.id;

  await fetch(`${BASE}/api/project-timeline-v1/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      projectId,
      eventType: "estimate_pdf_saved",
      title: "見積PDF保存",
      description: "見積書_レガシー.pdf",
    }),
  });
  await fetch(`${BASE}/api/estimate/v1/projects/${projectId}/pdf-share-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ documentKind: "estimate", fileName: "見積書_レガシー.pdf" }),
  });

  if (fs.existsSync(DB_PATH)) {
    const db = new Database(DB_PATH);
    db.prepare(`DELETE FROM project_timeline_events WHERE project_id = ?`).run(projectId);
    db.close();
  }
  return projectId;
}

async function openHistoryTab(page, projectId) {
  await page.goto(`${BASE}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}`, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector(".detail-tabs");
  await page.click('.detail-tab[data-tab="history"]');
  await page.waitForSelector(".tl-date-group, .timeline-list, .section-hint");
  await new Promise((r) => setTimeout(r, 400));
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await login(page);

  const projectId = await ensureRichProject();
  await openHistoryTab(page, projectId);
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

  const legacyId = await ensureLegacyProject();
  await openHistoryTab(page, legacyId);
  await shot(page, "05-timeline-legacy-backfill.png");

  const report = {
    capturedAt: new Date().toISOString(),
    projectId,
    legacyProjectId: legacyId,
    screenshots: [
      "01-timeline-list.png",
      "02-timeline-search-estimate.png",
      "03-timeline-pdf-share.png",
      "04-timeline-qnap.png",
      "05-timeline-legacy-backfill.png",
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

#!/usr/bin/env node
/** AI見積エンジン基盤 v1 — スクショ + verification-report */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "ai-estimate-engine-v1-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

async function login() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  return data.token;
}

async function preparePage(page, token, url = "/master-v1") {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ t, code }) => {
      localStorage.setItem("tisly_admin_token", t);
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { t: token, code: LOGIN.customerCode }
  );
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".master-bottom-nav", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
}

async function shotTab(page, token, tab, name, viewport, query = "") {
  await page.setViewport(viewport);
  await preparePage(page, token, `/master-v1${query}`);
  if (tab) {
    await page.click(`#bottom-nav button[data-tab="${tab}"]`);
    await new Promise((r) => setTimeout(r, 600));
  }
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await login();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };

  const files = [];
  files.push(await shotTab(page, token, "customers", "01-iphone-customer-master.png", iphone));
  files.push(await shotTab(page, token, "ranks", "02-iphone-rank-master.png", iphone));
  files.push(await shotTab(page, token, "work", "03-iphone-work-master.png", iphone));
  files.push(await shotTab(page, token, "stats", "04-iphone-master-stats.png", iphone, "?tab=stats"));
  files.push(await shotTab(page, token, "materials", "05-iphone-material-master.png", iphone));
  files.push(await shotTab(page, token, "prices", "06-iphone-price-override.png", iphone));
  files.push(await shotTab(page, token, "stats", "07-android10-master-stats.png", android, "?tab=stats"));

  const statsRes = await fetch(`${BASE}/api/ai-estimate-engine/v1/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const stats = await statsRes.json();

  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    phase: "ai_estimate_engine_v1",
    files: files.map((f) => path.basename(f)),
    statsSummary: {
      workCount: stats.workCount,
      materialCount: stats.materialCount,
      missingCostWork: stats.missingCost?.work?.length ?? 0,
      missingSellMaterials: stats.missingSell?.materials?.length ?? 0,
    },
    apiEndpoints: [
      "/api/ai-estimate-engine/v1/customer-master",
      "/api/ai-estimate-engine/v1/rank-master",
      "/api/ai-estimate-engine/v1/work-master",
      "/api/ai-estimate-engine/v1/material-master",
      "/api/ai-estimate-engine/v1/customer-price-override",
      "/api/ai-estimate-engine/v1/stats",
      "/api/ai-estimate-engine/v1/document-center/:projectId",
    ],
    uiPath: "/master-v1",
    redirectPath: "/ai-estimate-engine-v1",
  };

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

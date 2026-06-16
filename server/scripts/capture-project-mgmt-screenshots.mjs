#!/usr/bin/env node
/** 案件管理基盤 v1 UI screenshots */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-mgmt-screenshots");
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

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await login(page);

  await page.goto(`${BASE}/project-mgmt-v1`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#project-list");
  await shot(page, "01-project-mgmt-list.png");

  await page.click("#btn-toggle-create");
  await page.waitForSelector("#create-panel:not(.hidden)");
  await page.evaluate(() => {
    document.getElementById("create-title").value = "防犯カメラ設置工事";
    document.getElementById("create-customer").value = "スクリーンショットテスト様";
    document.getElementById("create-address").value = "茨城県守谷市テスト1-1";
    document.getElementById("create-assignee").value = "山中";
  });
  await shot(page, "02-project-mgmt-create-form.png");

  await page.click("#btn-save-create");
  await page.waitForFunction(() => window.location.pathname.includes("project-mgmt-detail"), {
    timeout: 15000,
  });
  await page.waitForSelector("#tab-panel");
  await shot(page, "03-project-mgmt-detail-overview.png");

  await page.click('.detail-tab[data-tab="estimate"]');
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "04-project-mgmt-detail-estimate-tab.png");

  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    screenshots: [
      "01-project-mgmt-list.png",
      "02-project-mgmt-create-form.png",
      "03-project-mgmt-detail-overview.png",
      "04-project-mgmt-detail-estimate-tab.png",
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

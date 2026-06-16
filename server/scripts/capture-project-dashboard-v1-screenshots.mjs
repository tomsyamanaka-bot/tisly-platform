#!/usr/bin/env node
/** 案件ダッシュボード v1 UI screenshots — iPhone 15 Pro 390×844 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "project-dashboard-v1-screenshots");
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

async function scrollToSection(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  }, selector);
  await new Promise((r) => setTimeout(r, 350));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
  await login(page);

  await page.goto(`${BASE}/project-dashboard-v1`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector("#kpi-scroll .kpi-pill", { timeout: 15000 });
  await shot(page, "01-dashboard-overview.png");

  await scrollToSection(page, "#today-list");
  await shot(page, "02-today-schedule.png");

  await scrollToSection(page, "#alerts-list");
  await shot(page, "03-alerts.png");

  await page.evaluate(() => {
    const input = document.getElementById("search-input");
    if (input) {
      input.value = "ダッシュボード";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 200));
  await shot(page, "04-search-results.png");

  const firstCard = await page.$("#alerts-list .dash-card[data-href], #recent-list .dash-card[data-href]");
  if (firstCard) {
    await firstCard.click();
    await page.waitForSelector(".dash-back-link", { timeout: 15000 });
    await shot(page, "05-detail-back-link.png");
  } else {
    const recent = await page.$("#recent-list .dash-card[data-href]");
    if (recent) {
      await page.goto(`${BASE}/project-dashboard-v1`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#recent-list .dash-card", { timeout: 10000 });
      await page.click("#recent-list .dash-card[data-href]");
      await page.waitForSelector(".dash-back-link", { timeout: 15000 });
      await shot(page, "05-detail-back-link.png");
    }
  }

  const report = {
    capturedAt: new Date().toISOString(),
    viewport: "390x844",
    base: BASE,
    files: fs.readdirSync(OUT).filter((f) => f.endsWith(".png")),
    apis: [
      "/api/dashboard-v1/summary",
      "/api/dashboard-v1/today",
      "/api/dashboard-v1/alerts",
      "/api/dashboard-v1/recent",
      "/api/dashboard-v1/city-stats",
      "/api/dashboard-v1/sales",
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

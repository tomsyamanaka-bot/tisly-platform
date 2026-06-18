#!/usr/bin/env node
/** 見積マスター v1 カテゴリ強化 UI screenshots */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "master-v1-category-screenshots");
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

async function preparePage(page, token) {
  await page.evaluateOnNewDocument(
    (t, code) => {
      localStorage.setItem("tisly_admin_token", t);
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    token,
    LOGIN.customerCode
  );
  await page.goto(`${BASE}/master-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () =>
      location.pathname.includes("master-v1") &&
      document.querySelector(".master-bottom-nav") &&
      document.body.textContent.includes("見積マスター"),
    { timeout: 25000 }
  );
  await new Promise((r) => setTimeout(r, 600));
}

async function shotTab(page, token, tab, name, viewport, extraFn) {
  await page.setViewport(viewport);
  await preparePage(page, token);
  await page.click(`#bottom-nav button[data-tab="${tab}"]`);
  await new Promise((r) => setTimeout(r, 600));
  if (extraFn) await extraFn(page);
  else await page.waitForSelector("#search-input", { timeout: 10000 }).catch(() => {});
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
  files.push(await shotTab(page, token, "customers", "01-iphone-customers.png", iphone));
  files.push(await shotTab(page, token, "work", "02-iphone-work-categories.png", iphone));
  try {
    await page.waitForSelector("#search-input", { timeout: 8000 });
    await page.click("#search-input", { clickCount: 3 });
    await page.type("#search-input", "LAN", { delay: 20 });
    await new Promise((r) => setTimeout(r, 700));
    const searchFile = path.join(OUT, "07-iphone-search-results.png");
    await page.screenshot({ path: searchFile, fullPage: true });
    files.push(searchFile);
    console.log("saved:", searchFile);
  } catch (e) {
    console.warn("search screenshot skipped:", e.message);
  }
  files.push(await shotTab(page, token, "materials", "03-iphone-materials-categories.png", iphone));
  files.push(await shotTab(page, token, "mappings", "04-iphone-symbol-mappings.png", iphone));
  files.push(await shotTab(page, token, "work", "05-android10-work-items.png", android));
  files.push(await shotTab(page, token, "materials", "06-android10-materials.png", android));

  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    feature: "master-v1-category-enhancement",
    files: files.map((f) => path.basename(f)),
    viewports: { iphone: "390x844", android10: "800x1280" },
    ok: true,
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

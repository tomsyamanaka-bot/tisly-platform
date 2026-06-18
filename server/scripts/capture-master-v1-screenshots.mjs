#!/usr/bin/env node
/** 見積マスター v1 UI screenshots — iPhone + Android 10インチ */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "master-v1-screenshots");
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
  await page.goto(`${BASE}/master-v1`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ t, code }) => {
      localStorage.setItem("tisly_admin_token", t);
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { t: token, code: LOGIN.customerCode }
  );
  await page.goto(`${BASE}/master-v1`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".master-bottom-nav", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
}

async function shot(page, token, name, viewport) {
  await page.setViewport(viewport);
  await preparePage(page, token);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

async function shotTab(page, token, tab, name, viewport) {
  await page.setViewport(viewport);
  await preparePage(page, token);
  await page.click(`#bottom-nav button[data-tab="${tab}"]`);
  await new Promise((r) => setTimeout(r, 600));
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
  files.push(await shot(page, token, "01-iphone-customers.png", iphone));
  files.push(await shotTab(page, token, "work", "02-iphone-work-items.png", iphone));
  files.push(await shotTab(page, token, "mappings", "03-iphone-symbol-mappings.png", iphone));
  files.push(await shot(page, token, "04-android10-customers.png", android));
  files.push(await shotTab(page, token, "materials", "05-android10-materials.png", android));

  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    files: files.map((f) => path.basename(f)),
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

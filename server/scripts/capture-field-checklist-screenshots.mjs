/**
 * 現場チェックリスト v1 提出用スクショ
 * Usage: npm run build && node scripts/capture-field-checklist-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/field-checklist-screenshots");
const baseUrl = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3000";
fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.type('input[name="customerCode"], #customerCode', "TOMS001", { delay: 20 }).catch(() => {});
  await page.type('input[name="username"], #username', "toms001.surveyor", { delay: 20 }).catch(() => {});
  await page.type('input[name="password"], #password', process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026", {
    delay: 20,
  }).catch(() => {});
  await page.click('button[type="submit"], #btn-login').catch(() => {});
  await page.waitForTimeout(1500);
}

async function capture(page, name, url) {
  await page.setViewport(iphone);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForTimeout(800);
  const out = path.join(outDir, name);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved:", out);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await login(page);
    await capture(page, "01-iphone-projects-checklist-tab.png", `${baseUrl}/projects-v1`);
    await capture(page, "02-field-checklist-screen.png", `${baseUrl}/field-checklist-v1`);
    await capture(page, "03-checklist-templates-admin.png", `${baseUrl}/checklist-templates-v1`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

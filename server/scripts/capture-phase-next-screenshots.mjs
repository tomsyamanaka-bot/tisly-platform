/**
 * Phase 5 検証 — 本フェーズ実装のスクショ + verification-report.json
 * Usage: npm run build && node scripts/capture-phase-next-screenshots.mjs [baseUrl]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/phase-next-verification");
fs.mkdirSync(outDir, { recursive: true });

const baseUrl = process.argv[2]?.replace(/\/$/, "") || "http://127.0.0.1:3080";
const iphone = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const androidTablet = { width: 800, height: 1280, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const report = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  phases: ["google-lock", "pwa-icons", "project-mgmt", "survey-drawing-v1"],
  screenshots: {},
  tests: {},
  health: null,
};

async function loginToken() {
  const res = await fetch(`${baseUrl}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(`login failed: ${res.status}`);
  return data.token;
}

async function injectAuth(page, token) {
  await page.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    sessionStorage.setItem("tisly_token", t);
    localStorage.setItem("tisly_admin_token", t);
  }, token);
}

async function shot(page, name, url, viewport) {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots[name] = file.replace(/\\/g, "/");
}

async function main() {
  const token = await loginToken();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await injectAuth(page, token);

  let projectId = "";
  try {
    const created = await fetch(`${baseUrl}/api/survey/v1/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        customerCode: "TOMS001",
        customerName: "フェーズ検証様",
        siteName: "図面検証現場",
        address: "茨城県守谷市",
        surveyDate: "2026-06-18",
      }),
    });
    const body = await created.json();
    projectId = body.projectId;
  } catch {
    /* */
  }

  await shot(page, "01-google-settings-iphone.png", `${baseUrl}/google-calendar-settings-v1`, iphone);
  await shot(page, "02-schedule-v1-iphone.png", `${baseUrl}/schedule-v1`, iphone);
  await shot(page, "03-app-hub-iphone.png", `${baseUrl}/app`, iphone);
  await shot(page, "04-projects-v1-iphone.png", `${baseUrl}/projects-v1`, iphone);
  await shot(page, "05-survey-v1-drawing-section-iphone.png", `${baseUrl}/survey-v1?projectId=${projectId}`, iphone);
  await shot(
    page,
    "06-survey-drawing-v1-iphone.png",
    `${baseUrl}/survey-drawing-v1?projectId=${encodeURIComponent(projectId)}`,
    iphone
  );
  await shot(
    page,
    "07-survey-drawing-v1-android-tablet.png",
    `${baseUrl}/survey-drawing-v1?projectId=${encodeURIComponent(projectId)}`,
    androidTablet
  );
  await shot(page, "08-project-mgmt-v1-iphone.png", `${baseUrl}/project-mgmt-v1`, iphone);

  await browser.close();

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    report.health = await health.json();
  } catch (e) {
    report.health = { error: String(e) };
  }

  const gcalReportPath = path.join(__dirname, "../data/google-bidirectional-sync-test/verification-report.json");
  if (fs.existsSync(gcalReportPath)) {
    report.tests.googleBidirectional = JSON.parse(fs.readFileSync(gcalReportPath, "utf8"));
  }

  report.summary = {
    screenshotCount: Object.keys(report.screenshots).length,
    commitShort: report.health?.commitShort ?? null,
  };

  const reportPath = path.join(outDir, "verification-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("report:", reportPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

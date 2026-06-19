/**
 * 案件自動化エンジン v1 提出用スクショ
 * Usage: npm run build && node scripts/capture-project-automation-v1-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/project-automation-v1-screenshots");
const baseUrl = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3000";
fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.type('input[name="customerCode"], #customerCode', "TOMS001", { delay: 20 }).catch(() => {});
  await page.type('input[name="username"], #username', "toms001.surveyor", { delay: 20 }).catch(() => {});
  await page.type('input[name="password"], #password', process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026", {
    delay: 20,
  }).catch(() => {});
  await page.click('button[type="submit"], #btn-login').catch(() => {});
  await sleep(1500);
}

async function capture(page, name, url) {
  await page.setViewport(iphone);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(900);
  const out = path.join(outDir, name);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved:", out);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await login(page);
    await capture(page, "01-project-mgmt-create-template.png", `${baseUrl}/project-mgmt-v1`);
    await page.click("#btn-toggle-create").catch(() => {});
    await sleep(500);
    await page.screenshot({ path: path.join(outDir, "02-create-form-template-select.png"), fullPage: true });
    console.log("saved:", path.join(outDir, "02-create-form-template-select.png"));

    const listRes = await page.evaluate(async () => {
      const token =
        localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
      const res = await fetch("/api/project-mgmt/v1/projects?limit=5", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const withAuto = (data.projects ?? []).find((p) => p.automation);
      return withAuto?.id ?? data.projects?.[0]?.id ?? "";
    });
    const projectId = process.env.TISLY_SCREENSHOT_PROJECT_ID || listRes;
    if (projectId) {
      await capture(
        page,
        "03-project-detail-automation-overview.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=overview`
      );
      await capture(
        page,
        "04-project-detail-tasks-tab.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=automation-tasks`
      );
      await capture(
        page,
        "05-project-detail-tools-tab.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=automation-tools`
      );
      await capture(
        page,
        "06-project-detail-photos-tab.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=automation-photos`
      );
      await capture(
        page,
        "07-documents-photo-slot.png",
        `${baseUrl}/documents-v1?projectId=${encodeURIComponent(projectId)}`
      );
    }
    await capture(page, "08-project-dashboard-progress.png", `${baseUrl}/project-dashboard-v1`);
  } finally {
    await browser.close();
  }

  const report = {
    capturedAt: new Date().toISOString(),
    outDir: "server/data/project-automation-v1-screenshots",
    screens: fs.readdirSync(outDir).filter((f) => f.endsWith(".png")),
    baseUrl,
  };
  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(outDir, "verification-report.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

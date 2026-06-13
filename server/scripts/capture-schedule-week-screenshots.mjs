/**
 * 日程調整週間一覧 — 確認スクショ生成（puppeteer）
 * 用法: node scripts/capture-schedule-week-screenshots.mjs [baseUrl]
 */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const baseUrl = process.argv[2]?.replace(/\/$/, "") || "http://127.0.0.1:3080";
const outDir = path.resolve("data/pdf-verify");
fs.mkdirSync(outDir, { recursive: true });

async function loginToken() {
  const res = await fetch(`${baseUrl}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function main() {
  const token = await loginToken();
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 430, height: 932 } });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/customer/TOMS001/login`, { waitUntil: "networkidle2" });
  await page.evaluate((t) => {
    localStorage.setItem("tisly_admin_token", t);
    sessionStorage.setItem("tisly_token", t);
  }, token);

  await page.goto(`${baseUrl}/schedule-v1`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#week-days .schedule-day-card", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  await page.screenshot({
    path: path.join(outDir, "schedule-week-overview.png"),
    fullPage: true,
  });

  const card614 = await page.$(`[data-date="2026-06-14"]`);
  if (card614) {
    await card614.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await new Promise((r) => setTimeout(r, 400));
    await card614.screenshot({ path: path.join(outDir, "schedule-week-0614-travel.png") });
  }

  const card619 = await page.$(`[data-date="2026-06-19"]`);
  if (card619) {
    await card619.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await new Promise((r) => setTimeout(r, 400));
    await card619.screenshot({ path: path.join(outDir, "schedule-week-0619-weather-travel.png") });
  }

  const materialBtn = await page.$('[data-date="2026-06-14"] .schedule-intel-material');
  if (materialBtn) {
    await materialBtn.click();
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({
      path: path.join(outDir, "schedule-material-check-open.png"),
      fullPage: true,
    });
  }

  await browser.close();
  console.log("Screenshots saved to", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

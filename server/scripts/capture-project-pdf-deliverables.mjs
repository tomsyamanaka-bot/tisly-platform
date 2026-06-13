/**
 * 案件PDF管理・削除ダイアログ・復元 UI スクショ
 * Usage: npm run build && node scripts/capture-project-pdf-deliverables.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/pdf-verify");
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:3000";
const USER = process.env.CAPTURE_USER || "toms001.surveyor";
const PASS = process.env.CAPTURE_PASS || process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026";

async function getToken() {
  const res = await fetch(`${BASE}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerCode: "TOMS001", username: USER, password: PASS }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "login failed");
  return data.token;
}

async function loginPage(page, token) {
  await page.goto(`${BASE}/projects-v1`, { waitUntil: "networkidle0" });
  await page.evaluate((t) => localStorage.setItem("tisly_customer_token_TOMS001", t), token);
}

function iphonePage(page) {
  return page.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  console.log("saved", name);
}

async function main() {
  const token = await getToken();
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await iphonePage(page);
  await loginPage(page, token);

  await page.goto(`${BASE}/projects-v1`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".project-card", { timeout: 15000 }).catch(() => {});
  const cards = await page.$$(".project-card");
  if (cards.length) {
    await cards[0].click();
    await page.waitForSelector("#detail-documents .pdf-row, #detail-documents .pdf-empty", { timeout: 10000 });
    await capture(page, "projects-pdf-list-mobile.png");

    const shareBtn = await page.$('[data-pdf-action="share"]');
    if (shareBtn) {
      await shareBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      await capture(page, "projects-pdf-share-mobile.png");
    }
  }

  await page.goto(`${BASE}/projects-v1`, { waitUntil: "networkidle0" });
  await page.click("#tab-deleted");
  await page.waitForSelector("#deleted-list", { timeout: 5000 });
  await capture(page, "projects-deleted-list-mobile.png");

  const delBtn = await page.$('[data-action="delete"]');
  if (delBtn) {
    await delBtn.click();
    await page.waitForSelector("#delete-dialog-overlay:not(.hidden)", { timeout: 5000 });
    await capture(page, "projects-delete-dialog-mobile.png");
    await page.click("#delete-dialog-cancel");
  }

  const restoreBtn = await page.$('[data-action="restore"]');
  if (restoreBtn) {
    await capture(page, "projects-restore-mobile.png");
  }

  const projectsRes = await fetch(`${BASE}/api/estimate/v1/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const projectsData = await projectsRes.json();
  const pid = projectsData.projects?.[0]?.id;
  if (pid) {
    for (const [kind, file] of [
      ["estimate", "deliverable-estimate.pdf"],
      ["invoice", "deliverable-invoice.pdf"],
      ["report", "deliverable-report.pdf"],
    ]) {
      const pdfRes = await fetch(`${BASE}/api/projects/v1/projects/${pid}/pdfs/${kind}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pdfRes.ok) {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        fs.writeFileSync(path.join(outDir, file), buf);
        console.log("saved", file, buf.length);
      }
    }
  }

  await browser.close();
  console.log("done", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

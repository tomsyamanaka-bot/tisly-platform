/**
 * Project Automation v1.5 提出用スクショ
 * Usage: npm run build && node scripts/capture-project-automation-v15-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/project-automation-v15-screenshots");
const baseUrl = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3000";
fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const android10 = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };

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

async function capture(page, name, url, viewport = iphone) {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(900);
  const out = path.join(outDir, name);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved:", out);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const screens = [];
  try {
    await login(page);

    await capture(page, "01-admin-template-list.png", `${baseUrl}/project-automation-admin-v1`);
    screens.push("01-admin-template-list.png");

    await page.click(".tpl-card .tpl-actions button[data-action='edit']").catch(() => {});
    await sleep(700);
    await page.screenshot({ path: path.join(outDir, "02-admin-task-template.png"), fullPage: true });
    screens.push("02-admin-task-template.png");
    console.log("saved:", path.join(outDir, "02-admin-task-template.png"));

    await page.click('.tab-btn[data-tab="tools"]').catch(() => {});
    await sleep(400);
    await page.screenshot({ path: path.join(outDir, "03-admin-tool-template.png"), fullPage: true });
    screens.push("03-admin-tool-template.png");

    await page.click('.tab-btn[data-tab="photos"]').catch(() => {});
    await sleep(400);
    await page.screenshot({ path: path.join(outDir, "04-admin-photo-template.png"), fullPage: true });
    screens.push("04-admin-photo-template.png");
    await page.click("#btn-editor-cancel").catch(() => {});
    await sleep(300);

    await capture(page, "05-project-create-template-preview.png", `${baseUrl}/project-mgmt-v1`);
    await page.click("#btn-toggle-create").catch(() => {});
    await sleep(400);
    await page.select("#create-template", "ptpl-camera").catch(async () => {
      await page.evaluate(() => {
        const sel = document.getElementById("create-template");
        if (sel?.options?.[1]) {
          sel.selectedIndex = 1;
          sel.dispatchEvent(new Event("change"));
        }
      });
    });
    await sleep(500);
    await page.screenshot({
      path: path.join(outDir, "05-project-create-template-preview.png"),
      fullPage: true,
    });

    const projectId =
      process.env.TISLY_SCREENSHOT_PROJECT_ID ||
      (await page.evaluate(async () => {
        const token =
          localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
        const res = await fetch("/api/project-mgmt/v1/projects?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const withAuto = (data.projects ?? []).find((p) => p.automation);
        return withAuto?.id ?? data.projects?.[0]?.id ?? "";
      }));

    if (projectId) {
      await capture(
        page,
        "06-project-detail-tasks.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=automation-tasks`
      );
      screens.push("06-project-detail-tasks.png");
      await capture(
        page,
        "07-project-detail-tools.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=automation-tools`
      );
      screens.push("07-project-detail-tools.png");
      await capture(
        page,
        "08-project-detail-photos.png",
        `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=automation-photos`
      );
      screens.push("08-project-detail-photos.png");
      await capture(
        page,
        "09-documents-photo-slot.png",
        `${baseUrl}/documents-v1?projectId=${encodeURIComponent(projectId)}`
      );
      screens.push("09-documents-photo-slot.png");
      await page.click("#btn-fab-upload").catch(() => {});
      await sleep(500);
      await page.screenshot({ path: path.join(outDir, "09-documents-photo-slot.png"), fullPage: true });
    }

    await capture(page, "10-dashboard-progress.png", `${baseUrl}/project-dashboard-v1`, android10);
    screens.push("10-dashboard-progress.png");
  } finally {
    await browser.close();
  }

  const report = {
    capturedAt: new Date().toISOString(),
    version: "project-automation-v1.5",
    outDir: "server/data/project-automation-v15-screenshots",
    viewports: { iphone: "390x844", android10: "800x1280" },
    screens: [...new Set([...screens, ...fs.readdirSync(outDir).filter((f) => f.endsWith(".png"))])].sort(),
    baseUrl,
    phases: {
      phase1: "テンプレート管理UI /project-automation-admin-v1",
      phase2: "案件作成テンプレプレビュー",
      phase3: "案件詳細 やる事/持ち物/施工写真タブ強化",
      phase4: "Document Center 施工写真スロット紐付け",
      phase5: "完了報告写真データ API",
      phase6: "AI提案ルールベース（ai_suggestions_v1）",
      phase7: "ダッシュボード進捗カウント表示",
    },
  };
  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(outDir, "verification-report.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

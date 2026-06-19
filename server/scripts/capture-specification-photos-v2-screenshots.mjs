/**
 * Specification Photos v2 提出用スクショ
 * Usage: npm run build && node scripts/capture-specification-photos-v2-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/specification-photos-v2-screenshots");
const baseUrl = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3000";
const password = process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026";
const LOGIN = { customerCode: "TOMS001", username: "toms001.surveyor", password };
fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loginToken() {
  const res = await fetch(`${baseUrl}/api/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed: ${data.error || res.status}`);
  return data.token;
}

async function injectSession(page, token) {
  await page.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(
    ({ token, code }) => {
      localStorage.setItem("tisly_admin_token", token);
      sessionStorage.setItem("tisly_token", token);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { token, code: LOGIN.customerCode }
  );
}

async function ensureCameraProject(token) {
  const listRes = await fetch(`${baseUrl}/api/project-mgmt/v1/projects?limit=30`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = await listRes.json();
  const hit = (list.projects || []).find((p) => p.automation?.specPhotos?.length >= 8) || null;
  if (hit?.id) return hit.id;

  const tplRes = await fetch(`${baseUrl}/api/project-automation/v1/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tpl = await tplRes.json();
  const camera = tpl.templates?.find((t) => t.name === "防犯カメラ工事");
  if (!camera) throw new Error("防犯カメラ工事 template not found");

  const created = await fetch(`${baseUrl}/api/project-mgmt/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "仕様書v2スクショ現場",
      customerName: "仕様書v2スクショ様",
      cityCode: "MO",
      templateId: camera.id,
    }),
  });
  const body = await created.json();
  if (!body.project?.id) throw new Error(`project create failed: ${body.error || created.status}`);
  return body.project.id;
}

async function capture(page, name, viewport = iphone) {
  await page.setViewport(viewport);
  const out = path.join(outDir, name);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved:", out);
  return name;
}

async function main() {
  const token = await loginToken();
  const projectId = await ensureCameraProject(token);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const screens = [];
  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    screens: [],
    notes: ["仕様書PDF v2 — 施工写真スロット連携"],
    projectId,
  };

  try {
    await injectSession(page, token);

    await page.goto(`${baseUrl}/project-mgmt-detail-v1?id=${encodeURIComponent(projectId)}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await sleep(800);
    await page.click('.detail-tab[data-tab="automation-spec-photos"]').catch(() => {});
    await sleep(700);
    screens.push(await capture(page, "01-project-detail-spec-photo-slots.png"));

    await page.click('.detail-tab[data-tab="specification"]').catch(() => {});
    await sleep(600);
    screens.push(await capture(page, "02-specification-tab-progress.png"));

    await page.goto(`${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(projectId)}&kind=specification`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await sleep(1200);
    screens.push(await capture(page, "03-specification-pdf-preview.png"));

    await page.goto(`${baseUrl}/documents-v1?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await sleep(800);
    await page.click("#btn-upload-open").catch(() => {});
    await sleep(500);
    screens.push(await capture(page, "04-document-center-spec-slot.png"));

    report.screens = screens;
    fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
    console.log("verification-report.json written");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

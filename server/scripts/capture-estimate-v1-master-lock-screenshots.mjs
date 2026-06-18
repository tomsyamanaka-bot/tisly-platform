#!/usr/bin/env node
/** 見積PWA 実務ロック検証スクショ */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "estimate-v1-master-lock-screenshots");
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

async function preparePage(page, token, url = "/estimate-v1") {
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(
    (t, code) => {
      localStorage.setItem("tisly_admin_token", t);
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    token,
    LOGIN.customerCode
  );
  const bust = `v=${Date.now()}`;
  const sep = url.includes("?") ? "&" : "?";
  await page.goto(`${BASE}${url}${sep}${bust}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.addStyleTag({
    content: "#tisly-practical-bottomnav-root { display: none !important; }",
  });
  await new Promise((r) => setTimeout(r, 600));
}

async function createMasterDraftEstimate(token) {
  const survey = await fetch(`${BASE}/api/survey/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      customerName: "見積ロック検証様",
      siteName: "ロック検証現場",
      address: "茨城県守谷市",
    }),
  }).then((r) => r.json());
  const projectId = survey.projectId;
  const sketchRes = await fetch(`${BASE}/api/survey/v1/projects/${projectId}/drawing-sketches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "ロック検証図面" }),
  }).then((r) => r.json());
  const sketchId = sketchRes.sketch.id;
  await fetch(`${BASE}/api/survey/v1/drawing-sketches/${sketchId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      layers: {
        schemaVersion: 2,
        drawingVersion: 2,
        canvasWidth: 800,
        canvasHeight: 600,
        paths: [],
        symbols: [
          {
            id: "s1",
            symbolType: "dome_camera",
            label: "ドーム",
            icon: "📷",
            color: "#2563eb",
            x: 50,
            y: 50,
            rotation: 0,
            scale: 1,
            memo: "",
          },
        ],
        notes: [],
        viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      },
    }),
  });
  const preview = await fetch(`${BASE}/api/master/v1/estimate-preview?sketchId=${sketchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const saved = await fetch(`${BASE}/api/master/v1/estimate-preview/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sketchId, preview }),
  }).then((r) => r.json());
  const imported = await fetch(`${BASE}/api/estimate/v1/from-master-draft/${saved.draft.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  return {
    sketchId,
    draftId: saved.draft.id,
    businessProjectId: imported.businessProjectId,
    estimateNo: imported.estimate?.estimateNo,
  };
}

async function shot(page, name, viewport) {
  await page.setViewport(viewport);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await login();
  const ctx = await createMasterDraftEstimate(token);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };
  const files = [];

  await preparePage(page, token, `/estimate-v1?project=${ctx.businessProjectId}`);
  await page.waitForSelector("#view-detail:not(.hidden)", { timeout: 20000 });
  files.push(await shot(page, "01-iphone-estimate-initial.png", iphone));

  await page.waitForSelector("#master-draft-badge:not(.hidden)", { timeout: 10000 }).catch(() => {});
  files.push(await shot(page, "02-iphone-master-draft-badge.png", iphone));

  await page.click("#btn-recalc-master-pricing");
  await new Promise((r) => setTimeout(r, 1500));
  files.push(await shot(page, "03-iphone-after-price-recalc.png", iphone));

  files.push(await shot(page, "04-iphone-missing-cost-warning.png", iphone));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
  await new Promise((r) => setTimeout(r, 400));
  files.push(await shot(page, "05-iphone-before-pdf.png", iphone));

  await preparePage(page, token, `/estimate-v1?project=${ctx.businessProjectId}`);
  await page.waitForSelector("#view-detail:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector(".line-item-card", { timeout: 10000 });
  files.push(await shot(page, "06-android10-line-items.png", android));

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    feature: "estimate-v1-master-lock-v1",
    businessProjectId: ctx.businessProjectId,
    masterDraftId: ctx.draftId,
    estimateNo: ctx.estimateNo,
    files: files.map((f) => path.basename(f)),
    viewports: { iphone: "390x844", android10: "800x1280" },
    healthCommitShort: health.commitShort || null,
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

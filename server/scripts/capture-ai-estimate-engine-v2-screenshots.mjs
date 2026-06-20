#!/usr/bin/env node
/** AI見積エンジン v2 — スクショ + verification-report */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "ai-estimate-engine-v2-screenshots");
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

async function preparePage(page, token, url = "/master-v1") {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ t, code }) => {
      localStorage.setItem("tisly_admin_token", t);
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { t: token, code: LOGIN.customerCode }
  );
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".master-bottom-nav", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
}

async function createDemoSketch(token) {
  const survey = await fetch(`${BASE}/api/survey/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      customerName: "AI見積v2スクショ様",
      siteName: "v2スクショ現場",
      address: "茨城県守谷市",
      workTypes: ["camera"],
    }),
  }).then((r) => r.json());

  const sketchRes = await fetch(`${BASE}/api/survey/v1/projects/${survey.projectId}/drawing-sketches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "v2スクショ図面" }),
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
        paths: [
          {
            id: "p1",
            tool: "route",
            lineType: "lan",
            color: "#2563eb",
            width: 3,
            points: [{ x: 0, y: 0 }, { x: 300, y: 0 }],
            lengthPx: 300,
          },
        ],
        symbols: [
          {
            id: "s1",
            symbolType: "dome_camera",
            label: "ドームカメラ",
            icon: "📷",
            color: "#2563eb",
            x: 80,
            y: 80,
            rotation: 0,
            scale: 1,
            memo: "入口",
          },
          {
            id: "s2",
            symbolType: "nvr",
            label: "NVR",
            icon: "💾",
            color: "#0d9488",
            x: 200,
            y: 120,
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

  return sketchId;
}

async function shotTab(page, token, tab, name, viewport, query = "") {
  await page.setViewport(viewport);
  await preparePage(page, token, `/master-v1${query}`);
  if (tab) {
    await page.click(`#bottom-nav button[data-tab="${tab}"]`);
    await new Promise((r) => setTimeout(r, 600));
  }
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await login();
  const sketchId = await createDemoSketch(token);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };

  const q = `?tab=estimate-preview&sketchId=${encodeURIComponent(sketchId)}`;
  const files = [];
  files.push(await shotTab(page, token, "estimate-preview", "01-iphone-estimate-candidates-v2.png", iphone, q));

  await preparePage(page, token, `/master-v1${q}`);
  await page.click("#btn-preview-load");
  await new Promise((r) => setTimeout(r, 1200));
  await page.setViewport(iphone);
  const loadedIphone = path.join(OUT, "02-iphone-estimate-candidates-loaded.png");
  await page.screenshot({ path: loadedIphone, fullPage: true });
  console.log("saved:", loadedIphone);
  files.push(loadedIphone);

  await page.setViewport(android);
  const loadedAndroid = path.join(OUT, "03-android-tablet-estimate-candidates-v2.png");
  await page.screenshot({ path: loadedAndroid, fullPage: true });
  console.log("saved:", loadedAndroid);
  files.push(loadedAndroid);

  const previewRes = await fetch(
    `${BASE}/api/master/v1/estimate-preview?sketchId=${encodeURIComponent(sketchId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const preview = await previewRes.json();

  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    phase: "ai_estimate_engine_v2",
    sketchId,
    files: files.map((f) => path.basename(String(f))),
    previewSummary: {
      schemaVersion: preview.schemaVersion,
      workLineCount: preview.workLines?.length ?? 0,
      materialLineCount: preview.materialLines?.length ?? 0,
      unmappedCount: preview.unmappedLines?.length ?? 0,
      warningCount: preview.warnings?.length ?? 0,
      totalSell: preview.totalSell,
      grossProfitRate: preview.grossProfitRate,
      mmPerPx: preview.mmPerPx,
      wasteFactor: preview.wasteFactor,
    },
    apiEndpoints: [
      "/api/master/v1/estimate-preview",
      "/api/master/v1/estimate-preview/apply",
      "/api/master/v1/estimate-drafts/:id",
      "/api/master/v1/estimate-drafts/:id/apply-to-estimate",
      "/api/ai-estimate-engine/v1/candidates-v2",
    ],
    uiPath: "/master-v1?tab=estimate-preview",
  };

  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

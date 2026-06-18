#!/usr/bin/env node
/** 現調図面 v2 UI screenshots — iPhone + Android 10インチ */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "survey-drawing-v2-screenshots");
const LOGIN = {
  customerCode: "TOMS001",
  username: "toms001.surveyor",
  password: process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026",
};

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

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

async function createSketch(token) {
  const surveyRes = await fetch(`${BASE}/api/survey/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      customerName: "図面v2スクショ様",
      siteName: "AI清書準備現場",
      address: "茨城県守谷市",
      surveyDate: "2026-06-18",
    }),
  });
  const survey = await surveyRes.json();
  if (!survey.projectId) throw new Error("survey create failed");

  const sketchRes = await fetch(`${BASE}/api/survey/v1/projects/${survey.projectId}/drawing-sketches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "v2配線図テスト" }),
  });
  const sketchData = await sketchRes.json();
  const sketchId = sketchData.sketch?.id;
  if (!sketchId) throw new Error("sketch create failed");

  await fetch(`${BASE}/api/survey/v1/drawing-sketches/${sketchId}/background`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: TINY_PNG, mimeType: "image/png" }),
  });

  const layers = {
    schemaVersion: 2,
    drawingVersion: 2,
    canvasWidth: 10,
    canvasHeight: 10,
    paths: [
      {
        id: "demo-route",
        tool: "route",
        lineType: "lan",
        color: "#2563eb",
        width: 3,
        points: [{ x: 20, y: 20 }, { x: 200, y: 120 }],
        lengthPx: 180,
      },
    ],
    symbols: [
      {
        id: "demo-cam",
        symbolType: "dome_camera",
        label: "ドームカメラ",
        icon: "📷",
        color: "#2563eb",
        x: 80,
        y: 60,
        rotation: 0,
        scale: 1,
        memo: "玄関",
      },
    ],
    notes: [{ id: "demo-note", text: "LAN配線", x: 120, y: 40, fontSize: 14, color: "#0f172a" }],
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  };

  await fetch(`${BASE}/api/survey/v1/drawing-sketches/${sketchId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ layers }),
  });

  return { projectId: survey.projectId, sketchId };
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved:", file);
}

async function captureViewport(page, token, projectId, sketchId, viewport, name) {
  await page.setViewport(viewport);
  await page.goto(`${BASE}/survey-drawing-v1`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ t, code, pid, sid }) => {
      sessionStorage.setItem("tisly_token", t);
      sessionStorage.setItem("tisly_customer_code", code);
    },
    { t: token, code: LOGIN.customerCode, pid: projectId, sid: sketchId }
  );
  await page.goto(
    `${BASE}/survey-drawing-v1?sketchId=${encodeURIComponent(sketchId)}&projectId=${encodeURIComponent(projectId)}`,
    { waitUntil: "networkidle2", timeout: 30000 }
  );
  await page.waitForSelector("#drawing-stage-wrap", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  await page.click('[data-tool="symbol"]');
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, name.replace(".png", "-symbol-palette.png"));

  await page.click('[data-tool="route"]');
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, name.replace(".png", "-line-types.png"));

  await page.click('[data-tool="pen"]');
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, name);
}

async function main() {
  const token = await login();
  const { projectId, sketchId } = await createSketch(token);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await captureViewport(page, token, projectId, sketchId, { width: 390, height: 844 }, "01-iphone-drawing.png");
  await captureViewport(
    page,
    token,
    projectId,
    sketchId,
    { width: 800, height: 1280, isMobile: true, hasTouch: true },
    "02-android10-drawing.png"
  );

  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    projectId,
    sketchId,
    viewports: [
      { name: "iPhone", width: 390, height: 844 },
      { name: "Android10", width: 800, height: 1280 },
    ],
    files: fs.readdirSync(OUT).filter((f) => f.endsWith(".png")),
    pass: true,
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log("report:", path.join(OUT, "verification-report.json"));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

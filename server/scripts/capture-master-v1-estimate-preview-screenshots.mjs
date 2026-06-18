#!/usr/bin/env node
/** 見積マスター v1 — 入力高速化 + AI見積プレビュー 検証スクショ */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "master-v1-estimate-preview-screenshots");
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
  await page.waitForFunction(
    () =>
      location.pathname.includes("master-v1") &&
      document.querySelector(".master-bottom-nav") &&
      document.body.textContent.includes("見積マスター"),
    { timeout: 25000 }
  );
  await new Promise((r) => setTimeout(r, 500));
}

async function createSketch(token) {
  const survey = await fetch(`${BASE}/api/survey/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      customerName: "スクショ検証様",
      siteName: "プレビュー現場",
      address: "茨城県守谷市",
    }),
  }).then((r) => r.json());
  const projectId = survey.projectId;
  const sketchRes = await fetch(`${BASE}/api/survey/v1/projects/${projectId}/drawing-sketches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "スクショ用図面" }),
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
            points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
            lengthPx: 200,
          },
        ],
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
  return sketchId;
}

async function shot(page, token, name, viewport, fn) {
  await page.setViewport(viewport);
  await preparePage(page, token);
  if (fn) await fn(page);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved:", file);
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await login();
  const sketchId = await createSketch(token);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };
  const files = [];

  files.push(
    await shot(page, token, "01-iphone-quick-add.png", iphone, async (p) => {
      await p.click('#bottom-nav button[data-tab="work"]');
      await p.waitForSelector("#quick-add-name", { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 500));
      await p.type("#quick-add-name", "クイック追加テスト作業", { delay: 15 });
    })
  );

  files.push(
    await shot(page, token, "02-iphone-continuous-input.png", iphone, async (p) => {
      await p.click('#bottom-nav button[data-tab="materials"]');
      await p.waitForSelector("#quick-add-name", { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 400));
      await p.click("#chk-continuous");
      await p.type("#quick-add-name", "連続入力テスト材料", { delay: 15 });
      await p.click("#btn-quick-save-next");
      await new Promise((r) => setTimeout(r, 600));
    })
  );

  files.push(
    await shot(page, token, "03-iphone-missing-cost-filter.png", iphone, async (p) => {
      await p.click('#bottom-nav button[data-tab="work"]');
      await p.waitForSelector("#missing-filter-chips", { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 400));
      await p.click('#missing-filter-chips button[data-missing="cost"]');
      await new Promise((r) => setTimeout(r, 700));
    })
  );

  files.push(
    await shot(page, token, "04-iphone-category-mgmt.png", iphone, async (p) => {
      await p.click('#bottom-nav button[data-tab="categories"]');
      await new Promise((r) => setTimeout(r, 700));
    })
  );

  files.push(
    await shot(page, token, "05-iphone-estimate-preview.png", iphone, async (p) => {
      await preparePage(p, token, `/master-v1?sketchId=${sketchId}`);
      await new Promise((r) => setTimeout(r, 1200));
    })
  );

  files.push(
    await shot(page, token, "06-android10-estimate-preview.png", android, async (p) => {
      await preparePage(p, token, `/master-v1?sketchId=${sketchId}`);
      await new Promise((r) => setTimeout(r, 1200));
    })
  );

  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    feature: "master-v1-estimate-preview-v1",
    sketchId,
    files: files.map((f) => path.basename(f)),
    viewports: { iphone: "390x844", android10: "800x1280" },
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

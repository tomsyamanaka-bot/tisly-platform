#!/usr/bin/env node
/** 見積マスター v1 → 見積PWA 連携 検証スクショ */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3080";
const OUT = path.join(process.cwd(), "data", "master-v1-estimate-apply-screenshots");
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
  await new Promise((r) => setTimeout(r, 500));
}

async function createSketch(token) {
  const survey = await fetch(`${BASE}/api/survey/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: "TOMS001",
      customerName: "見積反映検証様",
      siteName: "反映テスト現場",
      address: "茨城県守谷市",
    }),
  }).then((r) => r.json());
  const projectId = survey.projectId;
  const sketchRes = await fetch(`${BASE}/api/survey/v1/projects/${projectId}/drawing-sketches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "反映検証図面" }),
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
  return { sketchId, projectId };
}

async function createDraft(token, sketchId) {
  const previewRes = await fetch(`${BASE}/api/master/v1/estimate-preview?sketchId=${sketchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const preview = await previewRes.json();
  if (!previewRes.ok) throw new Error(preview.error || "preview failed");
  const savedRes = await fetch(`${BASE}/api/master/v1/estimate-preview/apply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sketchId, preview }),
  });
  const saved = await savedRes.json();
  if (!savedRes.ok || !saved.draft?.id) {
    throw new Error(saved.error || "draft save failed");
  }
  return saved.draft.id;
}

async function applyDraft(token, draftId) {
  const res = await fetch(`${BASE}/api/master/v1/estimate-drafts/${draftId}/apply-to-estimate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "apply failed");
  return data;
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
  const { sketchId } = await createSketch(token);
  const draftId = await createDraft(token, sketchId);
  const applyRes = await applyDraft(token, draftId);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
  const android = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true };
  const files = [];

  await preparePage(page, token, `/master-v1?sketchId=${sketchId}`);
  await page.click('#bottom-nav button[data-tab="estimate-preview"]');
  await page.waitForSelector("#preview-content", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1200));
  files.push(await shot(page, "01-iphone-estimate-preview.png", iphone));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 400));
  files.push(await shot(page, "02-iphone-apply-button.png", iphone));

  await preparePage(
    page,
    token,
    `/estimate-v1?masterDraftId=${draftId}&project=${applyRes.businessProjectId}`
  );
  await page.waitForSelector("#view-detail:not(.hidden)", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  files.push(await shot(page, "03-iphone-estimate-pwa-applied.png", iphone));

  await preparePage(page, token, `/master-v1?sketchId=${sketchId}`);
  await page.click('#bottom-nav button[data-tab="estimate-preview"]');
  await page.waitForSelector(".preview-pricing-grid", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  files.push(await shot(page, "04-iphone-pricing-summary.png", iphone));

  await preparePage(page, token, "/master-v1");
  await page.click('#bottom-nav button[data-tab="categories"]');
  await page.waitForSelector("#cat-sort-list", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  files.push(await shot(page, "05-iphone-category-sort.png", iphone));

  await preparePage(page, token, `/estimate-v1?project=${applyRes.businessProjectId}`);
  await page.waitForSelector("#view-detail:not(.hidden)", { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  files.push(await shot(page, "06-android10-estimate-pwa-applied.png", android));

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  const report = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    feature: "master-v1-estimate-apply-v1",
    sketchId,
    masterDraftId: draftId,
    businessProjectId: applyRes.businessProjectId,
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

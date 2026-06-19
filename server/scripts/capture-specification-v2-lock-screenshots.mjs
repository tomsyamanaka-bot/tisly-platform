/**
 * Specification PDF v2 lock — 提出用スクショ
 * Usage: npm run build && node scripts/capture-specification-v2-lock-screenshots.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "data/specification-v2-lock-screenshots");
const baseUrl = process.env.TISLY_SCREENSHOT_BASE || "http://127.0.0.1:3000";
const password = process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026";
const LOGIN = { customerCode: "TOMS001", username: "toms001.surveyor", password };
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

fs.mkdirSync(outDir, { recursive: true });

const iphone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const android10 = { width: 800, height: 1280, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };

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

async function ensureSpecProject(token) {
  const listRes = await fetch(`${baseUrl}/api/project-mgmt/v1/projects?limit=40`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = await listRes.json();
  const hit = (list.projects || []).find((p) => p.title?.includes("仕様書v2ロック"));
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
      title: "仕様書v2ロック検証現場",
      customerName: "v2ロック検証様",
      cityCode: "MO",
      templateId: camera.id,
    }),
  });
  const body = await created.json();
  if (!body.project?.id) throw new Error(`project create failed: ${body.error || created.status}`);
  const projectId = body.project.id;

  const photosRes = await fetch(
    `${baseUrl}/api/project-automation/v1/projects/${projectId}/specification-photos`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const photos = await photosRes.json();
  const slotIds = (photos.photos || []).slice(0, 2).map((p) => p.photoSlotId);
  for (let i = 0; i < slotIds.length; i++) {
    await fetch(`${baseUrl}/api/documents/v1/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        documentType: "photo",
        sourceType: "specification",
        title: `スロット${i + 1}`,
        fileName: `spec-lock-${i + 1}.png`,
        fileBase64: `data:image/png;base64,${TINY_PNG}`,
        mimeType: "image/png",
        specProjectPhotoId: slotIds[i],
      }),
    });
  }
  return projectId;
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
  const projectId = await ensureSpecProject(token);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  const screens = [];
  const report = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    projectId,
    screens: [],
    notes: ["仕様書PDF v2 実務ロック検証"],
  };

  try {
    await page.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ token, code }) => {
        localStorage.setItem("tisly_admin_token", token);
        sessionStorage.setItem("tisly_token", token);
        sessionStorage.setItem("tisly_customer_code", code);
      },
      { token, code: LOGIN.customerCode }
    );

    await page.goto(
      `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}`,
      { waitUntil: "networkidle0", timeout: 45000 }
    );
    await sleep(900);
    await page.click('.detail-tab[data-tab="automation-spec-photos"]').catch(() => {});
    await sleep(800);
    screens.push(await capture(page, "01-iphone-spec-photo-slots.png"));

    await page.goto(`${baseUrl}/projects-v1`, { waitUntil: "networkidle0", timeout: 45000 });
    await sleep(600);
    await page.evaluate((id) => {
      const card = document.querySelector(`[data-id="${id}"]`);
      card?.click();
    }, projectId);
    await sleep(1200);
    await page.click("#btn-create-specification").catch(() => {});
    await sleep(900);
    screens.push(await capture(page, "02-iphone-spec-pdf-pre-modal.png"));
    await page.click('.cr-photo-check-actions [data-action="proceed"]').catch(() => {});
    await sleep(1500);

    await page.goto(
      `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(projectId)}&kind=specification`,
      { waitUntil: "networkidle0", timeout: 45000 }
    );
    await sleep(1000);
    screens.push(await capture(page, "03-iphone-spec-pdf-preview.png"));

    await page.goto(`${baseUrl}/documents-v1?projectId=${encodeURIComponent(projectId)}`, {
      waitUntil: "networkidle0",
      timeout: 45000,
    });
    await sleep(800);
    await page.click("#btn-upload-open").catch(() => {});
    await sleep(600);
    screens.push(await capture(page, "04-iphone-document-center-spec-link.png"));
    await page.keyboard.press("Escape").catch(() => {});

    await page.setViewport(android10);
    await page.goto(`${baseUrl}/project-automation-admin-v1.html`, {
      waitUntil: "networkidle0",
      timeout: 45000,
    });
    await sleep(800);
    await page.click('.tpl-actions [data-action="edit"]').catch(() => {});
    await sleep(600);
    await page.click('.tab-btn[data-tab="spec-photos"]').catch(() => {});
    await sleep(600);
    screens.push(await capture(page, "05-android10-admin-spec-slots.png", android10));

    await page.setViewport(iphone);
    await page.goto(
      `${baseUrl}/project-mgmt-detail-v1?projectId=${encodeURIComponent(projectId)}&tab=files`,
      { waitUntil: "networkidle0", timeout: 45000 }
    );
    await sleep(900);
    screens.push(await capture(page, "06-qnap-status-display.png"));

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

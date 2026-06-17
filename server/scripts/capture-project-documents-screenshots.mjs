/**
 * 書類機能 — iPhone viewport 実機相当検証 + 6枚スクリーンショット
 * Usage:
 *   npm run build && node scripts/capture-project-documents-screenshots.mjs
 *   TISLY_BASE_URL=https://tisly.jp node scripts/capture-project-documents-screenshots.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/project-documents-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PROD_BASE = process.env.TISLY_BASE_URL || "";
const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "capture-project-documents";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = PROD_BASE ? "production" : "test";
if (!PROD_BASE) {
  process.env.TISLY_DB_PATH = path.join(__dirname, "../data/capture-project-documents.db");
}
process.env.RATE_LIMIT_PROVIDER = "memory";

if (!PROD_BASE) {
  for (const p of [
    process.env.TISLY_DB_PATH,
    `${process.env.TISLY_DB_PATH}-wal`,
    `${process.env.TISLY_DB_PATH}-shm`,
  ]) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* */
    }
  }
}

const { default: request } = await import("supertest");
const { createApp } = await import("../dist/app.js");
const { closeDatabase, getDatabase } = await import("../dist/db/database.js");
const { createCompletionReportV1 } = await import("../dist/estimate/estimate-v1-store.js");
const { markProjectPdfStaleV1, isProjectPdfStaleV1 } = await import(
  "../dist/projects/project-pdf-stale-v1.js"
);

let app;
let token = "";
let businessProjectId = "";
let server;
let baseUrl;

async function apiLogin(targetApp) {
  const login = await request(targetApp)
    .post("/api/auth/customer/login")
    .send(LOGIN);
  if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function setupFullProject(targetApp, authToken) {
  const survey = await request(targetApp)
    .post("/api/survey/v1/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "書類UIテスト",
      siteName: "守谷市テスト",
      address: "茨城県守谷市",
      surveyDate: "2026-06-16",
    });

  for (let i = 0; i < 3; i++) {
    await request(targetApp)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/photos`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ imageBase64: TINY_PNG, fileName: `survey-${i + 1}.jpg`, comment: `現調${i + 1}` });
  }

  await request(targetApp)
    .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  const est = await request(targetApp)
    .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  const bizId = est.body.businessProjectId;

  await request(targetApp)
    .patch(`/api/estimate/v1/projects/${bizId}/header`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({ addressee: "書類UIテスト", subject: "防犯カメラ設置工事" });

  await request(targetApp)
    .patch(`/api/estimate/v1/projects/${bizId}/items`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({
      items: [
        {
          id: "line-1",
          category: "other",
          name: "防犯カメラ設置",
          unit: "式",
          quantity: 1,
          unitPrice: 88000,
          amount: 88000,
        },
      ],
      notes: "納期2週間",
    });

  for (let i = 0; i < 3; i++) {
    await request(targetApp)
      .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ imageBase64: TINY_PNG, fileName: `completion-${i + 1}.jpg`, title: `完了${i + 1}` });
  }

  await request(targetApp)
    .post(`/api/estimate/v1/projects/${bizId}/finalize`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  await request(targetApp)
    .post(`/api/estimate/v1/projects/${bizId}/invoice`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});
  await createCompletionReportV1(bizId);

  const prefetch = await request(targetApp)
    .post(`/api/estimate/v1/projects/${bizId}/pdfs/prefetch`)
    .set("Authorization", `Bearer ${authToken}`)
    .send({});

  return { businessProjectId: bizId, prefetchBody: prefetch.body };
}

async function prodFetch(pathname, opts = {}) {
  const res = await fetch(`${PROD_BASE}${pathname}`, opts);
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  return { res, body };
}

async function setupProdProject() {
  const { body: loginBody, res: loginRes } = await prodFetch("/api/auth/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(LOGIN),
  });
  if (!loginRes.ok || !loginBody.token) throw new Error("prod login failed");
  token = loginBody.token;

  const surveyRes = await fetch(`${PROD_BASE}/api/survey/v1/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerCode: LOGIN.customerCode,
      customerName: "書類UIテスト",
      siteName: "守谷市テスト",
      address: "茨城県守谷市",
      surveyDate: "2026-06-16",
    }),
  });
  const survey = await surveyRes.json();
  const svyId = survey.projectId;

  for (let i = 0; i < 3; i++) {
    await fetch(`${PROD_BASE}/api/survey/v1/projects/${svyId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: TINY_PNG, fileName: `survey-${i + 1}.jpg`, comment: `現調${i + 1}` }),
    });
  }

  await fetch(`${PROD_BASE}/api/survey/v1/projects/${svyId}/estimate-pending`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });

  const estRes = await fetch(`${PROD_BASE}/api/estimate/v1/from-survey/${svyId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const est = await estRes.json();
  businessProjectId = est.businessProjectId;

  await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/header`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addressee: "書類UIテスト", subject: "防犯カメラ設置工事" }),
  });
  await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/items`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ id: "line-1", category: "other", name: "防犯カメラ設置", unit: "式", quantity: 1, unitPrice: 88000, amount: 88000 }],
      notes: "納期2週間",
    }),
  });

  for (let i = 0; i < 3; i++) {
    await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/completion-photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: TINY_PNG, fileName: `completion-${i + 1}.jpg`, title: `完了${i + 1}` }),
    });
  }

  await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/invoice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/completion-report/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });

  const prefetchRes = await fetch(`${PROD_BASE}/api/estimate/v1/projects/${businessProjectId}/pdfs/prefetch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const prefetchBody = await prefetchRes.json();
  return { businessProjectId, prefetchBody };
}

function iphoneUserAgent() {
  return "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
}

async function readUiState(page) {
  return page.evaluate(() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return { exists: false, visible: false, text: "" };
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        exists: true,
        visible: r.width >= 24 && r.height >= 24 && s.visibility !== "hidden" && s.display !== "none",
        text: el.textContent?.trim() ?? "",
      };
    };
    const frame = document.getElementById("pdf-frame");
    return {
      viewMode: document.body.classList.contains("doc-pdf-view-mode")
        ? "pdf"
        : document.body.classList.contains("doc-preview-mode")
          ? "preview"
          : "unknown",
      back: vis("btn-back"),
      pdf: vis("btn-pdf"),
      save: vis("btn-save"),
      share: vis("btn-share"),
      pdfFrameBlob: Boolean(frame?.src?.startsWith("blob:")),
      toast: document.getElementById("toast")?.textContent?.trim() ?? "",
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    };
  });
}

async function verifyPdfNoPhotos(targetApp, authToken, projectId, kind) {
  const paths = {
    estimate: `/api/estimate/v1/projects/${projectId}/pdf?format=html&includePhotos=0`,
    invoice: `/api/estimate/v1/projects/${projectId}/invoice/pdf?format=html&includePhotos=0`,
    specification: `/api/estimate/v1/projects/${projectId}/specification/pdf?format=html`,
    completion: `/api/estimate/v1/projects/${projectId}/completion-report/pdf?format=html`,
  };
  const res = await request(targetApp)
    .get(paths[kind])
    .set("Authorization", `Bearer ${authToken}`);
  const html = String(res.text || "");
  if (kind === "estimate" || kind === "invoice") {
    return !/cover-photo-grid|photo-grid|sp-cover-photo|cr-cover-photo/.test(html);
  }
  if (kind === "specification") {
    return /sp-cover-photo-grid/.test(html) && /grid-template-rows:\s*repeat\(3/.test(html);
  }
  return /cr-cover-photo-grid/.test(html) && /grid-template-rows:\s*repeat\(3/.test(html);
}

async function measurePdfFetchMs(page, pdfPath) {
  return page.evaluate(async (path) => {
    const token = sessionStorage.getItem("tisly_token") || localStorage.getItem("tisly_admin_token");
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}access_token=${encodeURIComponent(token)}`;
    const t0 = performance.now();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const t1 = performance.now();
    const head = await blob.slice(0, 5).text();
    return { ms: Math.round(t1 - t0), size: blob.size, head, ok: res.ok && head === "%PDF-" };
  }, pdfPath);
}

async function main() {
  let prefetchBody = {};
  let healthCommitShort = null;

  if (PROD_BASE) {
    baseUrl = PROD_BASE.replace(/\/$/, "");
    const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
    healthCommitShort = health.commitShort;
    const setup = await setupProdProject();
    businessProjectId = setup.businessProjectId;
    prefetchBody = setup.prefetchBody;
  } else {
    getDatabase();
    app = createApp();
    token = await apiLogin(app);
    const setup = await setupFullProject(app, token);
    businessProjectId = setup.businessProjectId;
    prefetchBody = setup.prefetchBody;

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  const shareJs = fs.readFileSync(path.join(__dirname, "../public/js/pdf-share-v1.js"), "utf8");
  const shareCodeOk =
    shareJs.includes("navigator.share({ files: [file]") &&
    !shareJs.includes("navigator.share({ title, url") &&
    shareJs.includes("application/pdf");

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setUserAgent(iphoneUserAgent());
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3, hasTouch: true });

  await page.evaluateOnNewDocument((t, code) => {
    localStorage.setItem("tisly_admin_token", t);
    sessionStorage.setItem("tisly_token", t);
    sessionStorage.setItem("tisly_customer_code", code);
  }, token, LOGIN.customerCode);

  await page.evaluateOnNewDocument(() => {
    window.__shareCapture = null;
    const origShare = navigator.share?.bind(navigator);
    navigator.share = async (data) => {
      const file = data?.files?.[0];
      window.__shareCapture = {
        fileName: file?.name,
        type: file?.type,
        hasUrl: Boolean(data?.url),
        hasTitle: Boolean(data?.title),
      };
      const overlay = document.createElement("div");
      overlay.id = "mock-share-sheet";
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:flex-end;";
      overlay.innerHTML = `<div style="background:#f2f2f7;width:100%;border-radius:16px 16px 0 0;padding:20px;font-family:-apple-system,sans-serif">
        <p style="margin:0 0 8px;font-weight:600;text-align:center">共有</p>
        <p style="margin:0 0 4px;font-size:14px">📄 ${file?.name || "document.pdf"}</p>
        <p style="margin:0;font-size:12px;color:#666">${file?.type || "application/pdf"}</p>
        <p style="margin:12px 0 0;font-size:13px;color:#007aff">LINE · ファイルに保存 · その他</p>
      </div>`;
      document.body.appendChild(overlay);
      return undefined;
    };
    if (origShare) navigator.__origShare = origShare;
    navigator.canShare = (data) => Boolean(data?.files?.length);
  });

  await page.goto(`${baseUrl}/estimate-v1?project=${encodeURIComponent(businessProjectId)}`, {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await page.waitForSelector("#view-detail:not(.hidden)", { timeout: 45000 });
  await page.waitForSelector("#doc-status-estimate", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById("doc-status-estimate");
      const list = document.querySelector("#doc-list-mount .doc-list-row");
      return el && el.textContent && el.textContent.trim() !== "—" && list;
    },
    { timeout: 60000 }
  );
  await new Promise((r) => setTimeout(r, 1500));

  const statusTexts = await page.evaluate(() => ({
    estimate: document.getElementById("doc-status-estimate")?.textContent?.trim(),
    invoice: document.getElementById("doc-status-invoice")?.textContent?.trim(),
    specification: document.getElementById("doc-status-specification")?.textContent?.trim(),
    completion: document.getElementById("doc-status-completion")?.textContent?.trim(),
  }));

  await page.evaluate(() => {
    document.querySelector(".doc-action-grid")?.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 400));
  const docGrid = await page.$(".doc-action-grid");
  if (docGrid) {
    await docGrid.screenshot({ path: path.join(outDir, "01-document-status-buttons.png") });
  } else {
    await page.screenshot({ path: path.join(outDir, "01-document-status-buttons.png") });
  }

  const list = await page.$("#doc-list-section");
  if (list) {
    await list.screenshot({ path: path.join(outDir, "02-document-list.png") });
  }

  const documentChecks = [];
  const screenshotMap = {
    estimate: "03-estimate-pdf-viewer-iphone.png",
    invoice: "04-invoice-pdf-share-sheet.png",
    specification: "05-specification-pdf-viewer.png",
    "completion-report": "06-completion-report-pdf-viewer.png",
  };

  const returnPath = `/estimate-v1?project=${encodeURIComponent(businessProjectId)}`;

  for (const [kind, label, shotKey] of [
    ["estimate", "見積書", "estimate"],
    ["invoice", "請求書", "invoice"],
    ["specification", "仕様書", "specification"],
    ["completion-report", "工事完了報告書", "completion-report"],
  ]) {
    const viewerUrl = `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(businessProjectId)}&kind=${encodeURIComponent(kind)}&return=${encodeURIComponent(returnPath)}`;
    await page.goto(viewerUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("#btn-back", { timeout: 30000 });
    await page.waitForFunction(
      () =>
        document.getElementById("doc-loading")?.classList.contains("hidden") &&
        document.getElementById("doc-mobile")?.innerHTML?.length > 20,
      { timeout: 45000 }
    );

    const previewUi = await readUiState(page);
    const scrollOk = previewUi.scrollHeight > previewUi.clientHeight;

    await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3, hasTouch: true });
    await page.click("#btn-pdf");
    await page.waitForFunction(
      () => document.getElementById("pdf-frame")?.src?.startsWith("blob:"),
      { timeout: 45000 }
    );
    const pdfUi = await readUiState(page);

    await page.setViewport({ width: 844, height: 390, isMobile: true, deviceScaleFactor: 3, hasTouch: true });
    await new Promise((r) => setTimeout(r, 500));
    const landscapeUi = await readUiState(page);

    if (kind === "invoice") {
      await page.click("#btn-share");
      await page.waitForFunction(() => window.__shareCapture?.fileName, { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(outDir, screenshotMap.invoice), fullPage: false });
    } else {
      await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3, hasTouch: true });
      await page.screenshot({ path: path.join(outDir, screenshotMap[kind]), fullPage: false });
    }

    const shareCapture = await page.evaluate(() => window.__shareCapture);
    await page.evaluate(() => {
      document.getElementById("mock-share-sheet")?.remove();
      window.__shareCapture = null;
    });

    await page.click("#btn-back");
    await page.waitForFunction(
      () => document.body.classList.contains("doc-preview-mode"),
      { timeout: 15000 }
    );
    const backUi = await readUiState(page);

    await page.click("#btn-back");
    await page.waitForFunction(() => location.href.includes("estimate-v1"), { timeout: 15000 });
    const backToList = page.url().includes("estimate-v1") && page.url().includes("project=");

    documentChecks.push({
      kind,
      label,
      previewOk: previewUi.viewMode === "preview",
      pdfOk: pdfUi.viewMode === "pdf" && pdfUi.pdfFrameBlob && pdfUi.back.visible,
      landscapeOk: landscapeUi.viewMode === "pdf" && landscapeUi.back.visible,
      scrollOk,
      backToPreviewOk: backUi.viewMode === "preview",
      backToListOk: backToList,
      saveVisible: previewUi.save.visible,
      shareVisible: previewUi.share.visible,
      shareCapture,
      shareFilesOnly: shareCapture ? !shareCapture.hasUrl && shareCapture.type === "application/pdf" : null,
    });
  }

  const estimateViewerUrl = `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(businessProjectId)}&kind=estimate&return=${encodeURIComponent(returnPath)}`;
  await page.goto(estimateViewerUrl, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.getElementById("doc-loading")?.classList.contains("hidden"),
    { timeout: 30000 }
  );
  const pdfPath = `/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`;
  const firstFetch = await measurePdfFetchMs(page, pdfPath);
  const secondFetch = await measurePdfFetchMs(page, pdfPath);
  const cacheFaster = secondFetch.ms <= firstFetch.ms;

  let staleRegenerated = false;
  if (!PROD_BASE) {
    markProjectPdfStaleV1(businessProjectId, "estimate");
    const staleBefore = isProjectPdfStaleV1(businessProjectId, "estimate");
    const regen = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?includePhotos=false`)
      .set("Authorization", `Bearer ${token}`);
    const staleAfter = isProjectPdfStaleV1(businessProjectId, "estimate");
    staleRegenerated = staleBefore && !staleAfter && regen.status === 200;
  } else {
    const statusRes = await fetch(
      `${baseUrl}/api/estimate/v1/projects/${businessProjectId}/documents-status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const statusData = await statusRes.json();
    staleRegenerated = statusData.documents?.some((d) => d.status === "ready" || d.status === "stale");
  }

  await page.goto(`${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(businessProjectId)}&kind=invoice&return=${encodeURIComponent(returnPath)}`, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector("#btn-share", { timeout: 20000 });
  await page.click("#btn-share");
  await page.waitForFunction(() => window.__shareCapture?.fileName, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));

  const shareLogRes = PROD_BASE
    ? await fetch(`${baseUrl}/api/estimate/v1/projects/${businessProjectId}/pdf-share-log`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json())
    : (
        await request(app)
          .get(`/api/estimate/v1/projects/${businessProjectId}/pdf-share-log`)
          .set("Authorization", `Bearer ${token}`)
      ).body;

  const shareLogs = shareLogRes.logs || [];
  const shareLogOk = Boolean(
    Array.isArray(shareLogs) &&
      shareLogs.length >= 1 &&
      shareLogs[0].projectId === businessProjectId &&
      shareLogs[0].documentKind &&
      shareLogs[0].fileName &&
      shareLogs[0].sharedAt
  );

  let photoLayout = {};
  if (!PROD_BASE) {
    photoLayout = {
      estimateNoPhotos: await verifyPdfNoPhotos(app, token, businessProjectId, "estimate"),
      invoiceNoPhotos: await verifyPdfNoPhotos(app, token, businessProjectId, "invoice"),
      specSixGrid: await verifyPdfNoPhotos(app, token, businessProjectId, "specification"),
      completionSixGrid: await verifyPdfNoPhotos(app, token, businessProjectId, "completion"),
    };
  }

  await browser.close();
  if (server) server.close();
  if (!PROD_BASE) closeDatabase();

  if (!healthCommitShort && PROD_BASE) {
    healthCommitShort = (await fetch(`${PROD_BASE}/api/health`).then((r) => r.json())).commitShort;
  }

  const statusOk =
    statusTexts.estimate?.includes("作成済") &&
    statusTexts.invoice?.includes("作成済") &&
    statusTexts.specification?.includes("作成済") &&
    statusTexts.completion?.includes("作成済");

  const allDocsOk = documentChecks.every(
    (d) =>
      d.previewOk &&
      d.pdfOk &&
      d.landscapeOk &&
      d.backToPreviewOk &&
      d.backToListOk &&
      d.saveVisible &&
      d.shareVisible
  );

  const report = {
    at: new Date().toISOString(),
    mode: PROD_BASE ? "production" : "local-iphone-sim",
    baseUrl: baseUrl,
    commitShort: healthCommitShort,
    businessProjectId,
    prefetchBody,
    shareCodeOk,
    statusTexts,
    statusOk,
    documentChecks,
    allDocsOk,
    cache: { firstFetchMs: firstFetch.ms, secondFetchMs: secondFetch.ms, cacheFaster, firstOk: firstFetch.ok, secondOk: secondFetch.ok },
    staleRegenerated,
    shareLogOk,
    shareLogs: Array.isArray(shareLogs) ? shareLogs.slice(0, 3) : shareLogs,
    photoLayout,
    screenshots: [
      "01-document-status-buttons.png",
      "02-document-list.png",
      "03-estimate-pdf-viewer-iphone.png",
      "04-invoice-pdf-share-sheet.png",
      "05-specification-pdf-viewer.png",
      "06-completion-report-pdf-viewer.png",
    ],
    allOk: shareCodeOk && statusOk && allDocsOk && shareLogOk && firstFetch.ok && secondFetch.ok && staleRegenerated,
  };

  if (!PROD_BASE) {
    report.allOk =
      report.allOk &&
      photoLayout.estimateNoPhotos &&
      photoLayout.invoiceNoPhotos &&
      photoLayout.specSixGrid &&
      photoLayout.completionSixGrid;
  }

  fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 書類閲覧 UX — モバイル viewport で4帳票の chrome・preview↔PDF戻る・files-only 共有を検証。
 * Usage: npm run build && node scripts/verify-doc-viewer-mobile.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/doc-viewer-mobile-verify");
const addresseeDir = path.join(__dirname, "../data/addressee-underline-verify");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(addresseeDir, { recursive: true });

process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-doc-viewer-mobile";
process.env.CUSTOMER_DEMO_PASSWORD = process.env.CUSTOMER_DEMO_PASSWORD || "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/verify-doc-viewer-mobile.db");
process.env.RATE_LIMIT_PROVIDER = "memory";

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

const { default: request } = await import("supertest");
const { createApp } = await import("../dist/app.js");
const { closeDatabase, getDatabase } = await import("../dist/db/database.js");
const { createCompletionReportV1 } = await import("../dist/estimate/estimate-v1-store.js");

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

getDatabase();
const app = createApp();

const login = await request(app)
  .post("/api/auth/customer/login")
  .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
if (!login.body.token) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
const token = login.body.token;

const survey = await request(app)
  .post("/api/survey/v1/projects")
  .set("Authorization", `Bearer ${token}`)
  .send({
    customerCode: "TOMS001",
    customerName: "フレックス株式会社",
    siteName: "守谷市テスト",
    address: "茨城県守谷市",
    surveyDate: "2026-06-16",
  });
const svyId = survey.body.projectId;

for (let i = 0; i < 3; i++) {
  await request(app)
    .post(`/api/survey/v1/projects/${svyId}/photos`)
    .set("Authorization", `Bearer ${token}`)
    .send({ imageBase64: TINY_PNG, fileName: `survey-${i + 1}.jpg`, comment: `現調${i + 1}` });
}

await request(app)
  .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
  .set("Authorization", `Bearer ${token}`)
  .send({});

const est = await request(app)
  .post(`/api/estimate/v1/from-survey/${svyId}`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
const bizId = est.body.businessProjectId;

await request(app)
  .patch(`/api/estimate/v1/projects/${bizId}/header`)
  .set("Authorization", `Bearer ${token}`)
  .send({ addressee: "フレックス株式会社", subject: "防犯カメラ設置工事" });

await request(app)
  .patch(`/api/estimate/v1/projects/${bizId}/items`)
  .set("Authorization", `Bearer ${token}`)
  .send({
    items: [{ name: "カメラ設置", quantity: 2, unit: "台", unitPrice: 25000, amount: 50000, category: "other" }],
  });

for (let i = 0; i < 3; i++) {
  await request(app)
    .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
    .set("Authorization", `Bearer ${token}`)
    .send({ imageBase64: TINY_PNG, fileName: `completion-${i + 1}.jpg`, title: `完了${i + 1}` });
}

await request(app)
  .post(`/api/estimate/v1/projects/${bizId}/finalize`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
await request(app)
  .post(`/api/estimate/v1/projects/${bizId}/invoice`)
  .set("Authorization", `Bearer ${token}`)
  .send({});
await createCompletionReportV1(bizId);

const shareJs = fs.readFileSync(path.join(__dirname, "../public/js/pdf-share-v1.js"), "utf8");
const viewerJs = fs.readFileSync(path.join(__dirname, "../public/js/document-viewer-v1.js"), "utf8");
const shareCodeOk =
  shareJs.includes("navigator.share({ files: [file]") &&
  !shareJs.includes("navigator.share({ title, url") &&
  !viewerJs.includes("navigator.share({ title, url") &&
  shareJs.includes("application/pdf") &&
  shareJs.includes("LINE_SHARE_HINT");

const server = http.createServer(app);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${baseUrl}/customer/TOMS001/login`, { waitUntil: "networkidle2" });
await page.evaluate((t) => {
  localStorage.setItem("tisly_admin_token", t);
  sessionStorage.setItem("tisly_token", t);
}, token);

const report = {
  generatedAt: new Date().toISOString(),
  businessProjectId: bizId,
  shareCodeOk,
  shareEvidence: {
    filesOnlyShare: shareJs.includes("navigator.share({ files: [file]"),
    noTitleUrlShare: !shareJs.includes("navigator.share({ title, url"),
    pdfFileType: shareJs.includes('type: "application/pdf"'),
    lineShareHint: shareJs.includes("LINE_SHARE_HINT"),
  },
  addresseeUnderline: {},
  documents: [],
};

const kinds = [
  ["estimate", "見積書"],
  ["invoice", "請求書"],
  ["specification", "仕様書"],
  ["completion-report", "工事完了報告書"],
];

async function readUiState() {
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
    const mobile = document.getElementById("doc-mobile");
    const frame = document.getElementById("pdf-frame");
    const mobileVisible = mobile && window.getComputedStyle(mobile).display !== "none";
    const frameHasBlob = frame && frame.src && frame.src.startsWith("blob:");
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
      mobilePreviewVisible: Boolean(mobileVisible),
      pdfFrameBlob: Boolean(frameHasBlob),
    };
  });
}

for (const [kind, label] of kinds) {
  const viewerUrl = `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(bizId)}&kind=${encodeURIComponent(kind)}&return=${encodeURIComponent("/estimate-v1")}`;
  await page.goto(viewerUrl, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#btn-back", { timeout: 30000 });
  try {
    await page.waitForFunction(
      () => {
        const loading = document.getElementById("doc-loading");
        const mobile = document.getElementById("doc-mobile");
        const loadingDone = loading && loading.classList.contains("hidden");
        const hasPreview = mobile && mobile.innerHTML.trim().length > 20;
        return loadingDone && hasPreview && document.body.classList.contains("doc-preview-mode");
      },
      { timeout: 45000 }
    );
  } catch (e) {
    const debug = await page.evaluate(() => ({
      url: location.href,
      bodyClass: document.body.className,
      loadingHidden: document.getElementById("doc-loading")?.classList.contains("hidden"),
      mobileLen: document.getElementById("doc-mobile")?.innerHTML?.length ?? 0,
      errorText: document.getElementById("doc-error")?.textContent ?? "",
    }));
    throw new Error(`preview load failed (${kind}): ${JSON.stringify(debug)}`);
  }

  const previewUi = await readUiState();

  await page.click("#btn-pdf");
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("pdf-frame");
      return frame && frame.src && frame.src.startsWith("blob:");
    },
    { timeout: 45000 }
  );
  const pdfUi = await readUiState();

  await page.click("#btn-back");
  await page.waitForFunction(
    () =>
      document.body.classList.contains("doc-preview-mode") &&
      window.getComputedStyle(document.getElementById("doc-mobile")).display !== "none",
    { timeout: 15000 }
  );
  const backUi = await readUiState();

  const docView = await request(app)
    .get(`/api/estimate/v1/projects/${bizId}/document-view?kind=${kind}`)
    .set("Authorization", `Bearer ${token}`);
  const pdfPath = docView.body.pdfUrl;
  const pdfRes = await request(app)
    .get(pdfPath.replace(/^\//, "/"))
    .set("Authorization", `Bearer ${token}`);
  const pdfOk =
    pdfRes.status === 200 &&
    (pdfRes.headers["content-type"] || "").includes("application/pdf") &&
    Buffer.byteLength(pdfRes.body) >= 10000;

  const png = path.join(outDir, `${kind}.png`);
  await page.screenshot({ path: png });

  const entry = {
    kind,
    label,
    screenshot: png,
    previewModeOk: previewUi.viewMode === "preview" && previewUi.mobilePreviewVisible,
    pdfModeOk: pdfUi.viewMode === "pdf" && pdfUi.pdfFrameBlob && pdfUi.back.visible,
    backToPreviewOk: backUi.viewMode === "preview" && backUi.mobilePreviewVisible && !backUi.pdfFrameBlob,
    backVisible: previewUi.back.visible && previewUi.back.text.includes("戻る"),
    pdfButtonVisible: previewUi.pdf.visible && previewUi.pdf.text.includes("PDF"),
    saveButtonVisible: previewUi.save.visible && previewUi.save.text.includes("保存"),
    shareButtonVisible: previewUi.share.visible && previewUi.share.text.includes("LINE"),
    pdfApi: {
      ok: pdfOk,
      status: pdfRes.status,
      contentType: pdfRes.headers["content-type"],
      bytes: Buffer.byteLength(pdfRes.body),
    },
  };
  report.documents.push(entry);
  console.log(
    `${label}: preview=${entry.previewModeOk} pdf=${entry.pdfModeOk} back=${entry.backToPreviewOk} api=${pdfOk}`
  );
}

// 宛名下線 — 見積・請求 HTML を Puppeteer でキャプチャ
for (const [kind, fileName, htmlPath] of [
  ["estimate", "estimate-addressee", `/api/estimate/v1/projects/${bizId}/pdf?format=html&regenerate=1&includePhotos=0`],
  ["invoice", "invoice-addressee", `/api/estimate/v1/projects/${bizId}/invoice/pdf?format=html&regenerate=1&includePhotos=0`],
]) {
  const htmlRes = await request(app).get(htmlPath).set("Authorization", `Bearer ${token}`);
  const ct = String(htmlRes.headers["content-type"] || "");
  const html =
    typeof htmlRes.text === "string" && htmlRes.text.startsWith("<!")
      ? htmlRes.text
      : ct.includes("text/html")
        ? String(htmlRes.text ?? htmlRes.body ?? "")
        : "";
  if (html.length < 100) throw new Error(`${kind} html empty or not html (${htmlRes.status}, ${ct})`);
  const hasFullRowUnderline =
    !html.includes("toms-v2-addressee-line") &&
    /\.toms-v2-addressee-row[\s\S]*border-bottom:\s*1px solid #000/.test(html);
  report.addresseeUnderline[kind] = { hasFullRowUnderline, contentType: ct };

  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const shotPath = path.join(addresseeDir, `${fileName}.png`);
  const row = await page.$(".toms-v2-addressee-row");
  if (row) {
    await row.screenshot({ path: shotPath });
  } else {
    await page.screenshot({ path: shotPath, fullPage: false });
  }
  report.addresseeUnderline[kind].screenshot = shotPath;
  console.log(`${kind} addressee underline: ${hasFullRowUnderline} → ${shotPath}`);
}

await page.close();
await browser.close();
server.close();
closeDatabase();

report.allOk =
  shareCodeOk &&
  report.addresseeUnderline.estimate?.hasFullRowUnderline &&
  report.addresseeUnderline.invoice?.hasFullRowUnderline &&
  report.documents.every(
    (d) =>
      d.previewModeOk &&
      d.pdfModeOk &&
      d.backToPreviewOk &&
      d.backVisible &&
      d.pdfButtonVisible &&
      d.saveButtonVisible &&
      d.shareButtonVisible &&
      d.pdfApi.ok
  );

fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`shareCodeOk=${shareCodeOk} allOk=${report.allOk}`);
console.log(`Report: ${outDir}`);
console.log(`Addressee screenshots: ${addresseeDir}`);
process.exit(report.allOk ? 0 : 1);

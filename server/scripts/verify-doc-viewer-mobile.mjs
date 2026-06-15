/**
 * 書類閲覧 UX — モバイル viewport で4帳票の chrome（←戻る / PDFにする / 共有）と
 * files-only 共有コードを検証。
 * Usage: npm run build && node scripts/verify-doc-viewer-mobile.mjs
 */
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../data/doc-viewer-mobile-verify");
fs.mkdirSync(outDir, { recursive: true });

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
    customerName: "書類閲覧モバイル検証",
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
  shareJs.includes("application/pdf");

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
  documents: [],
};

const kinds = [
  ["estimate", "見積書"],
  ["invoice", "請求書"],
  ["specification", "仕様書"],
  ["completion-report", "工事完了報告書"],
];

for (const [kind, label] of kinds) {
  const viewerUrl = `${baseUrl}/document-viewer-v1.html?projectId=${encodeURIComponent(bizId)}&kind=${encodeURIComponent(kind)}&return=${encodeURIComponent("/estimate-v1")}`;
  await page.goto(viewerUrl, { waitUntil: "networkidle2", timeout: 60000 });

  await page.waitForSelector("#btn-back", { timeout: 30000 });
  await page.waitForSelector("#btn-pdf", { timeout: 15000 });
  await page.waitForSelector("#btn-share", { timeout: 15000 });
  await page.waitForSelector("#pdf-frame", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("pdf-frame");
      return frame && frame.src && frame.src.startsWith("blob:");
    },
    { timeout: 30000 }
  );

  const ui = await page.evaluate(() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return { exists: false, visible: false, text: "" };
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return {
        exists: true,
        visible: r.width >= 30 && r.height >= 24 && s.visibility !== "hidden" && s.display !== "none",
        text: el.textContent?.trim() ?? "",
      };
    };
    return {
      back: vis("btn-back"),
      pdf: vis("btn-pdf"),
      share: vis("btn-share"),
    };
  });

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
    backVisible: ui.back.visible && ui.back.text.includes("戻る"),
    pdfButtonVisible: ui.pdf.visible && ui.pdf.text.includes("PDF"),
    shareButtonVisible: ui.share.visible && ui.share.text.includes("共有"),
    pdfApi: {
      ok: pdfOk,
      status: pdfRes.status,
      contentType: pdfRes.headers["content-type"],
      bytes: Buffer.byteLength(pdfRes.body),
    },
  };
  report.documents.push(entry);
  console.log(
    `${label}: back=${entry.backVisible} pdf=${entry.pdfButtonVisible} share=${entry.shareButtonVisible} api=${pdfOk} (${entry.pdfApi.bytes}B)`
  );
}

await page.close();
await browser.close();
server.close();
closeDatabase();

report.allOk =
  shareCodeOk &&
  report.documents.every(
    (d) =>
      d.backVisible &&
      d.pdfButtonVisible &&
      d.shareButtonVisible &&
      d.pdfApi.ok
  );

fs.writeFileSync(path.join(outDir, "verification-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`shareCodeOk=${shareCodeOk} allOk=${report.allOk}`);
console.log(`Report: ${outDir}`);
process.exit(report.allOk ? 0 : 1);

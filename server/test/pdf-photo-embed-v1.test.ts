import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

process.env.JWT_SECRET = "test-jwt-pdf-photo-embed";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-pdf-photo-embed-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const {
  embedPdfImagesInHtml,
  resolveImageSrcToDataUrl,
  resolveUploadUrlToLocalPath,
} = await import("../src/business/pdf/pdf-image-embed.js");
const { htmlToPdfBuffer } = await import("../src/business/pdf/render.js");
const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const { buildProjectPdfFileNameForProject } = await import("../src/projects/project-pdf-store.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("PDF 写真 embed / ファイル名", () => {
  let token = "";
  let businessProjectId = "";

  before(async () => {
    closeDatabase();
    const dbPath = process.env.TISLY_DB_PATH!;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
    getDatabase();
    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;

    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "上田",
        siteName: "カメラ工事現場",
        address: "東京都",
        surveyDate: "2026-06-14",
      });
    const svyId = survey.body.projectId;
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageBase64: TINY_PNG, fileName: "cam1.jpg", comment: "設置位置" });
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(est.status, 201, est.body?.error ?? JSON.stringify(est.body));
    businessProjectId = est.body.businessProjectId;

    const headerPatch = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/header`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "カメラ工事" });
    assert.equal(headerPatch.status, 200, headerPatch.body?.error);
  });

  after(() => closeDatabase());

  it("resolveUploadUrlToLocalPath — /uploads をローカルへ", () => {
    const local = resolveUploadUrlToLocalPath("/uploads/business/BIZ-TEST/survey/x.jpg");
    assert.ok(local?.includes(path.join("uploads", "business")));
  });

  it("embedPdfImagesInHtml — img を base64 data URL に変換", () => {
    const uploadDir = path.join(process.cwd(), "uploads", "business", "embed-test", "survey");
    fs.mkdirSync(uploadDir, { recursive: true });
    const fileName = "sample.jpg";
    fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(TINY_PNG, "base64"));
    const src = `/uploads/business/embed-test/survey/${fileName}`;
    const html = `<div class="sp-photo-cell"><div class="sp-photo-img-wrap"><img src="${src}" alt="test"/></div></div>`;
    const out = embedPdfImagesInHtml(html);
    assert.match(out, /src="data:image\/jpeg;base64,/);
    const dataUrl = resolveImageSrcToDataUrl(src);
    assert.ok(dataUrl?.startsWith("data:image/jpeg;base64,"));
  });

  it("embedPdfImagesInHtml — 欠落画像は枠ごと除去", () => {
    const html =
      '<div class="sp-photo-cell"><div class="sp-photo-img-wrap"><img src="/uploads/missing/photo.jpg" alt="x"/></div></div>';
    const out = embedPdfImagesInHtml(html);
    assert.ok(!out.includes("sp-photo-cell"));
    assert.ok(!out.includes("photo.jpg"));
  });

  it("仕様書 PDF — 写真入り・実務ファイル名・サイズ", async () => {
    if (process.env.TISLY_PDF_PUPPETEER === "false") return;

    const regen = await request(app)
      .post(`/api/projects/v1/projects/${businessProjectId}/pdfs/specification/regenerate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(regen.status, 200, regen.body?.error);

    const fileName = regen.body.pdf.fileName as string;
    assert.equal(fileName, "仕様書_上田様_カメラ工事.pdf");

    const pdfRes = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/specification/pdf?regenerate=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(pdfRes.status, 200);
    assert.match(String(pdfRes.headers["content-type"]), /application\/pdf/i);
    const disp = String(pdfRes.headers["content-disposition"] || "");
    assert.ok(disp.includes(encodeURIComponent("仕様書_上田様_カメラ工事.pdf")));

    const body = Buffer.isBuffer(pdfRes.body) ? pdfRes.body : Buffer.from(String(pdfRes.body || ""), "binary");
    assert.ok(body.length >= 10000, `PDF too small: ${body.length}`);
    assert.equal(body.subarray(0, 5).toString("ascii"), "%PDF-");

    const buf = await htmlToPdfBuffer(
      embedPdfImagesInHtml(
        (await request(app)
          .get(
            `/api/estimate/v1/projects/${businessProjectId}/specification/pdf?format=html&live=1`
          )
          .set("Authorization", `Bearer ${token}`)).text
      )
    );
    assert.ok(buf && buf.length >= 10000);
  });

  it("buildProjectPdfFileNameForProject — 見積書名", async () => {
    const detail = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.status, 200);
    const name = buildProjectPdfFileNameForProject(
      "estimate",
      { customerName: detail.body.customerName, title: detail.body.title },
      detail.body.estimate
    );
    assert.equal(name, "見積書_上田様_カメラ工事.pdf");
  });
});

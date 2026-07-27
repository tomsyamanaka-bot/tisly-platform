import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-estimate-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-estimate-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

function countContinuationPhotoPages(html: string, prefix: "sp" | "cr"): number {
  return (html.match(new RegExp(`class="${prefix}-page ${prefix}-photo-page"`, "g")) || []).length;
}

function countCoverPhotoCells(html: string, prefix: "sp" | "cr"): number {
  const coverRe = new RegExp(
    `class="${prefix}-page ${prefix}-cover-page"[\\s\\S]*?(?=class="${prefix}-page |$)`
  );
  const cover = html.match(coverRe)?.[0] ?? "";
  return (cover.match(new RegExp(`class="${prefix}-photo-cell(?:\\s|")`, "g")) || []).length;
}

const TOMS_ESTIMATE_NO_RE = /^[A-Z]{2}-\d{2}-\d{4}-\d{3}$/;

describe("見積PWA v1 API", () => {
  let token = "";
  let surveyProjectId = "";
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
        customerName: "見積テスト顧客",
        address: "大阪府大阪市",
        surveyDate: "2026-06-08",
      });
    surveyProjectId = survey.body.projectId;

    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/materials`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "camera", itemLabel: "屋外カメラ", quantity: 2 });

    await request(app)
      .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
  });

  after(() => closeDatabase());

  it("見積待ち一覧を取得できる", async () => {
    const res = await request(app)
      .get("/api/estimate/v1/pending-surveys?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.surveys.some((s: { surveyProjectId: string }) => s.surveyProjectId === surveyProjectId));
  });

  it("現調案件から見積を作成できる（部材シード）", async () => {
    const res = await request(app)
      .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.ok(res.body.businessProjectId);
    assert.ok(res.body.estimate);
    assert.ok(res.body.estimate.items.length >= 1);
    assert.match(res.body.estimate.estimateNo, TOMS_ESTIMATE_NO_RE);
    businessProjectId = res.body.businessProjectId;

    const handoff = getDatabase()
      .prepare(`SELECT business_project_id FROM survey_handoff_log WHERE survey_project_id = ?`)
      .get(surveyProjectId) as { business_project_id: string };
    assert.equal(handoff.business_project_id, businessProjectId);
  });

  it("見積明細を更新し税込計算できる", async () => {
    const detail = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const items = detail.body.estimate.items.map((it: { name: string; category: string; unit: string; quantity: number; unitPrice: number }) => ({
      ...it,
      unitPrice: 50000,
      amount: 50000 * it.quantity,
    }));
    const res = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items });
    assert.equal(res.status, 200);
    assert.ok(res.body.totals.subtotal > 0);
    assert.equal(res.body.totals.tax, Math.round(res.body.totals.subtotal * 0.1));
    assert.equal(res.body.totals.total, res.body.totals.subtotal + res.body.totals.tax);
  });

  it("見積を確定してPDFパスを取得できる", async () => {
    const res = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 200);
    assert.ok(res.body.pdfPath);
    assert.equal(res.body.surveyWorkflowStatus, "estimate_done");

    const survey = await request(app)
      .get(`/api/survey/v1/projects/${surveyProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(survey.body.workflowStatus, "estimate_done");
  });

  it("TOMSフォーマットプレビューを取得できる", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/toms-format`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.version, "toms-standard-v1");
    assert.ok(Array.isArray(res.body.lines));
  });

  it("PDFプレビューはJWT（Bearer）で取得できる", async () => {
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const ct = String(res.headers["content-type"] || "");
    assert.ok(ct.includes("pdf") || ct.includes("html"));
    if (ct.includes("html")) {
      assert.ok(res.text.includes("お見積書"));
      assert.ok(res.text.includes("株式会社TOMS"));
      assert.ok(res.text.includes("項目"));
      assert.ok(!res.text.includes("インボイス番号"));
      assert.ok(!res.text.includes("T-2030001139320"));
    } else {
      assert.ok(Buffer.isBuffer(res.body) ? res.body.length > 50 : true);
    }
  });

  it("PDFプレビューはaccess_tokenクエリでも取得できる", async () => {
    const res = await request(app).get(
      `/api/estimate/v1/projects/${businessProjectId}/pdf?access_token=${encodeURIComponent(token)}`
    );
    assert.equal(res.status, 200);
  });

  it("見積項目を複数行追加・更新できる", async () => {
    const items = [
      { name: "防犯カメラ設置", unit: "台", quantity: 2, unitPrice: 30000, amount: 60000, category: "camera" },
      { name: "配線工事", unit: "式", quantity: 1, unitPrice: 50000, amount: 50000, category: "other" },
      { name: "試験・調整", unit: "式", quantity: 1, unitPrice: 10000, amount: 10000, category: "other" },
    ];
    const res = await request(app)
      .patch(`/api/estimate/v1/projects/${businessProjectId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({ items, notes: "納期2週間程度" });
    assert.equal(res.status, 200);
    assert.equal(res.body.estimate.items.length, 3);
    assert.equal(res.body.totals.subtotal, 120000);
  });

  it("確定前でもPDFプレビュー（HTML）が返る", async () => {
    const survey2 = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "ドラフトPDF顧客",
        siteName: "ドラフト現場",
        address: "東京都",
      });
    await request(app)
      .post(`/api/survey/v1/projects/${survey2.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const draft = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey2.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${draft.body.businessProjectId}/pdf?format=html`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("お見積書") || res.text.includes("小計"));
  });

  it("GET /estimate-v1 ページを配信できる", async () => {
    const res = await request(app).get("/estimate-v1");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("見積を確定") || res.text.includes("TiSLY — 見積"));
    assert.ok(res.text.includes("社内用データを確認"));
    assert.ok(res.text.includes("仕様書"));
    assert.ok(res.text.includes("完了報告書"));
    assert.ok(res.text.includes("見積を複製"));
    assert.ok(res.text.includes("価格再計算"));
    assert.ok(res.text.includes("マスター候補から作成"));
    assert.ok(!res.text.includes("写真付き"));
    assert.ok(res.text.includes("工事場所"));
    assert.ok(!res.text.includes("現場名"));
    assert.match(res.text, /estimate-ui-v20/);
  });

  it("estimate-v1 JS: 自動保存無効・ローディング強制解除・UI先バインド", () => {
    const js = fs.readFileSync(new URL("../public/js/estimate-v1.js", import.meta.url), "utf-8");
    assert.match(js, /ESTIMATE_UI_VERSION = "estimate-ui-v20"/);
    assert.match(js, /ENABLE_HEADER_DATE_AUTOSAVE = false/);
    assert.match(js, /BOOTSTRAP_WATCHDOG_MS = 10_000/);
    assert.match(js, /データの取得に失敗しました/);
    assert.match(js, /UI ハンドラをすべてバインドする/);
    assert.match(js, /listCardDetailHtml/);
    assert.match(js, /件名：/);
    assert.match(js, /現場：/);
    assert.match(js, /金額：/);
    assert.doesNotMatch(js, /persistHeaderDatesQuietly/);
    assert.doesNotMatch(js, /addEventListener\("change", scheduleHeaderDateSave\)/);
  });

  it("見積を複製すると見積番号だけ再発番される", async () => {
    const before = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    const oldNo = before.body.estimate.estimateNo;
    const res = await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/duplicate`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(res.status, 201);
    assert.notEqual(res.body.estimate.estimateNo, oldNo);
    assert.match(res.body.estimate.estimateNo, TOMS_ESTIMATE_NO_RE);
    assert.equal(res.body.estimate.items.length, before.body.estimate.items.length);
  });

  it("見積PDF・請求PDFに写真セクションが含まれない", async () => {
    const estPdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/pdf?format=html`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(estPdf.status, 200);
    assert.ok(!estPdf.text.includes("参考写真"));

    await request(app)
      .post(`/api/estimate/v1/projects/${businessProjectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const invPdf = await request(app)
      .get(`/api/estimate/v1/projects/${businessProjectId}/invoice/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(invPdf.status, 200);
    assert.ok(!invPdf.text.includes("参考写真"));
  });

  it("仕様書は写真なしで仕様書タイトルとTOMS会社情報を含む", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "仕様書なし顧客",
        siteName: "仕様書現場",
        address: "東京都港区",
        assignee: "担当次郎",
        surveyDate: "2026-06-11",
      });
    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${est.body.businessProjectId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("仕様書"));
    assert.ok(!res.text.includes("システム仕様書"));
    assert.ok(res.text.includes("写真未登録"));
    assert.ok(res.text.includes("株式会社TOMS"));
    assert.ok(res.text.includes("東京都港区"));
    assert.ok(res.text.includes("Page 1 /"));
    assert.ok(!res.text.includes("参考写真"));
  });

  it("仕様書は写真6枚で1ページ目に6枚収まる", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "6枚仕様書",
        siteName: "6枚現場",
        address: "神奈川県",
      });
    const svyId = survey.body.projectId;
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post(`/api/survey/v1/projects/${svyId}/photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `sp-${i}.jpg` });
    }
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${est.body.businessProjectId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(countCoverPhotoCells(res.text, "sp"), 6);
    assert.equal(countContinuationPhotoPages(res.text, "sp"), 0);
    assert.ok(res.text.includes("写真1"));
    assert.ok(res.text.includes("写真6"));
    assert.ok(res.text.includes("6枚現場"));
    assert.ok(
      /<div class="sp-photo-img-wrap">[\s\S]*?<p class="sp-photo-title">/.test(res.text),
      "photo title should appear below photo image"
    );
  });

  it("仕様書は写真9枚で7枚目以降のみ2ページ目へ", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "9枚仕様書",
        siteName: "9枚仕様現場",
        address: "埼玉県",
      });
    const svyId = survey.body.projectId;
    for (let i = 0; i < 9; i++) {
      await request(app)
        .post(`/api/survey/v1/projects/${svyId}/photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `sp9-${i}.jpg` });
    }
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${est.body.businessProjectId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(countCoverPhotoCells(res.text, "sp"), 6);
    assert.equal(countContinuationPhotoPages(res.text, "sp"), 1);
  });

  it("仕様書・完了報告書にお客様向けPDFに社内メモを出さない", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "メモPDFテスト",
        siteName: "メモ現場",
        address: "東京都",
        notes: "配線ルート要確認",
      });
    const svyId = survey.body.projectId;
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    const spec = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(spec.status, 200);
    assert.ok(!spec.text.includes("配線ルート要確認"));
    assert.ok(!spec.text.includes("システム構成"));
    assert.ok(!spec.text.includes("設置場所一覧"));
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(cr.status, 200);
    assert.ok(!cr.text.includes("配線ルート要確認"));
    assert.ok(!cr.text.includes("開始時間"));
    assert.ok(!cr.text.includes("使用部材"));
    assert.ok(!cr.text.includes("確認結果"));
  });

  it("仕様書は現調写真タイトルを反映し、完了報告書には流用しない", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "タイトルテスト",
        siteName: "タイトル現場",
        address: "千葉県",
      });
    const svyId = survey.body.projectId;
    const photo = await request(app)
      .post(`/api/survey/v1/projects/${svyId}/photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageBase64: TINY_PNG, fileName: "title-test.jpg" });
    await request(app)
      .patch(`/api/survey/v1/projects/${svyId}/photos/${photo.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "配電盤全景" });
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    const spec = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(spec.status, 200);
    assert.ok(spec.text.includes("配電盤全景"));
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(cr.status, 200);
    assert.ok(!cr.text.includes("配電盤全景"));
    assert.ok(cr.text.includes("完了報告書用写真がありません"));
  });

  it("完了報告書用写真APIで追加した写真が完了報告書PDFに出る", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "完了写真API",
        siteName: "完了写真現場",
        address: "茨城県",
      });
    const svyId = survey.body.projectId;
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    const uploaded = await request(app)
      .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageBase64: TINY_PNG, fileName: "after.jpg", title: "施工後全景" });
    assert.equal(uploaded.status, 201);
    await request(app)
      .patch(`/api/estimate/v1/projects/${bizId}/completion-photos/${uploaded.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "施工後全景" });
    const list = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.photos.length, 1);
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(cr.status, 200);
    assert.ok(cr.text.includes("施工後全景"));
    const del = await request(app)
      .delete(`/api/estimate/v1/projects/${bizId}/completion-photos/${uploaded.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 204);
  });

  it("完了報告書は写真なしで専用メッセージとTOMS会社情報を含む", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "写真なし顧客",
        siteName: "未撮影現場",
        address: "東京都千代田区",
        assignee: "担当花子",
        surveyDate: "2026-06-10",
      });
    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${est.body.businessProjectId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("完了報告書"));
    assert.ok(res.text.includes("完了報告書用写真がありません"));
    assert.ok(res.text.includes("株式会社TOMS"));
    assert.ok(res.text.includes("千代田区"));
    assert.ok(res.text.includes("Page 1 /"));
  });

  it("完了報告書は完了報告書用写真6枚で1ページ目に6枚収まる", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "8枚テスト",
        siteName: "8枚現場",
        address: "大阪府",
      });
    const svyId = survey.body.projectId;
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `p${i}.jpg` });
    }
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(countCoverPhotoCells(res.text, "cr"), 6);
    assert.equal(countContinuationPhotoPages(res.text, "cr"), 0);
  });

  it("完了報告書は完了報告書用写真12枚で7枚目以降が2ページ目へ", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "完了報告テスト",
        siteName: "報告現場",
        address: "兵庫県神戸市",
        assignee: "担当太郎",
        surveyDate: "2026-06-09",
      });
    const svyId = survey.body.projectId;
    const titles = [
      "玄関カメラ",
      "事務所NVR",
      "駐車場配管",
      "LAN配線",
      "屋外カメラ",
      "配電盤",
      "受付モニタ",
      "倉庫",
      "屋上",
      "機械室",
      "会議室",
      "廊下",
    ];
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    for (let i = 0; i < 12; i++) {
      const photo = await request(app)
        .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `cr-${i}.jpg` });
      await request(app)
        .patch(`/api/estimate/v1/projects/${bizId}/completion-photos/${photo.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: titles[i] });
    }
    const res = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes("完了報告書"));
    assert.ok(res.text.includes("玄関カメラ"));
    assert.ok(res.text.includes("LAN配線"));
    assert.equal(countCoverPhotoCells(res.text, "cr"), 6);
    assert.equal(countContinuationPhotoPages(res.text, "cr"), 1);
  });

  it("完了報告書用写真の並び替えが完了報告書PDFに反映される", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "完了写真順序",
        siteName: "完了写真順序現場",
        address: "埼玉県",
      });
    await request(app)
      .post(`/api/survey/v1/projects/${survey.body.projectId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${survey.body.projectId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    const photoIds: string[] = [];
    for (const title of ["先頭", "中間", "末尾"]) {
      const photo = await request(app)
        .post(`/api/estimate/v1/projects/${bizId}/completion-photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `${title}.jpg` });
      photoIds.push(photo.body.id);
      await request(app)
        .patch(`/api/estimate/v1/projects/${bizId}/completion-photos/${photo.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title });
    }
    await request(app)
      .post(`/api/estimate/v1/projects/${bizId}/completion-photos/${photoIds[1]}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ direction: "up" });
    await request(app)
      .delete(`/api/estimate/v1/projects/${bizId}/completion-photos/${photoIds[0]}`)
      .set("Authorization", `Bearer ${token}`);
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(cr.status, 200);
    assert.ok(cr.text.includes("中間"));
    assert.ok(cr.text.includes("末尾"));
    assert.ok(!cr.text.includes("先頭"));
    const midPos = cr.text.indexOf("中間");
    const endPos = cr.text.indexOf("末尾");
    assert.ok(midPos >= 0 && endPos > midPos, "completion photo order should be 中間 then 末尾");
  });

  it("仕様書は現調写真の並び替えと削除を反映する", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "PDF順序テスト",
        siteName: "PDF順序現場",
        address: "神奈川県",
      });
    const svyId = survey.body.projectId;
    const photoIds: string[] = [];
    for (const title of ["先頭", "中間", "末尾"]) {
      const photo = await request(app)
        .post(`/api/survey/v1/projects/${svyId}/photos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageBase64: TINY_PNG, fileName: `${title}.jpg` });
      photoIds.push(photo.body.id);
      await request(app)
        .patch(`/api/survey/v1/projects/${svyId}/photos/${photo.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title });
    }
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/photos/${photoIds[1]}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ direction: "up" });
    await request(app)
      .delete(`/api/survey/v1/projects/${svyId}/photos/${photoIds[0]}`)
      .set("Authorization", `Bearer ${token}`);
    await request(app)
      .post(`/api/survey/v1/projects/${svyId}/estimate-pending`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const est = await request(app)
      .post(`/api/estimate/v1/from-survey/${svyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const bizId = est.body.businessProjectId;
    const spec = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(spec.status, 200);
    assert.equal(cr.status, 200);
    assert.ok(spec.text.includes("中間"));
    assert.ok(spec.text.includes("末尾"));
    assert.ok(!spec.text.includes("先頭"));
    assert.ok(cr.text.includes("完了報告書用写真がありません"));
    const midPos = spec.text.indexOf("中間");
    const endPos = spec.text.indexOf("末尾");
    assert.ok(midPos >= 0 && endPos > midPos, "spec photo order should be 中間 then 末尾");
  });

  it("単独見積をヘッダーのみで作成できる", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/standalone-estimate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        addressee: "単独見積テスト株式会社",
        subject: "LAN配線工事",
        staffName: "山田",
        workLocation: "大阪府大阪市",
        notes: "現調なし単独見積",
        items: [],
      });
    assert.equal(res.status, 201, res.body?.error);
    assert.ok(res.body.businessProjectId);
    assert.ok(res.body.estimate?.items?.length >= 1);
    assert.equal(res.body.header?.addressee, "単独見積テスト株式会社");

    const list = await request(app)
      .get("/api/estimate/v1/projects?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    const card = list.body.projects.find(
      (p: { businessProjectId: string }) => p.businessProjectId === res.body.businessProjectId
    );
    assert.ok(card);
    assert.equal(card.subject, "LAN配線工事");
    assert.equal(card.workLocation, "大阪府大阪市");
    assert.ok(card.customerName.includes("単独見積テスト"));
  });

  it("単独請求書をヘッダーのみで作成できる", async () => {
    const res = await request(app)
      .post("/api/estimate/v1/standalone-invoice")
      .set("Authorization", `Bearer ${token}`)
      .send({
        addressee: "単独請求テスト株式会社",
        subject: "防犯カメラ工事",
        staffName: "佐藤",
        invoiceDate: "2026-06-13",
        paymentDueDate: "2026-07-13",
        notes: "単独請求テスト",
        items: [],
      });
    assert.equal(res.status, 201, res.body?.error);
    assert.ok(res.body.invoice);
    assert.equal(res.body.invoice.customerName, "単独請求テスト株式会社");
  });

  it("見積テンプレートと顧客候補APIが使える", async () => {
    const tpl = await request(app)
      .get("/api/estimate/v1/line-templates")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(tpl.status, 200);
    assert.ok(tpl.body.templates.length >= 8);
    const first = tpl.body.templates[0];
    const items = await request(app)
      .get(`/api/estimate/v1/line-templates/${first.id}/items`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(items.status, 200);
    assert.ok(items.body.items.length >= 1);

    const suggest = await request(app)
      .get("/api/estimate/v1/customers/suggest?q=単独")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(suggest.status, 200);
    assert.ok(Array.isArray(suggest.body.suggestions));
  });

  it("見積から請求書へ明細がコピーされる", async () => {
    const est = await request(app)
      .post("/api/estimate/v1/standalone-estimate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        addressee: "コピーテスト株式会社",
        subject: "コピー確認",
        items: [{ name: "テスト項目A", quantity: 2, unitPrice: 5000, unit: "式" }],
      });
    const bizId = est.body.businessProjectId;
    await request(app)
      .patch(`/api/estimate/v1/projects/${bizId}/items`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ name: "テスト項目A", quantity: 2, unitPrice: 5000, unit: "式", orderTarget: true }],
      });
    const inv = await request(app)
      .post(`/api/estimate/v1/projects/${bizId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(inv.status, 201, inv.body?.error);
    const detail = await request(app)
      .get(`/api/estimate/v1/projects/${bizId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(detail.body.invoice.items[0].name, "テスト項目A");
    assert.equal(detail.body.invoice.items[0].quantity, 2);
    assert.equal(detail.body.invoice.items[0].unitPrice, 5000);
  });

  it("masterDraftId から見積明細をインポートできる", async () => {
    const survey = await request(app)
      .post("/api/survey/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerCode: "TOMS001",
        customerName: "マスター連携テスト様",
        siteName: "連携現場",
        address: "茨城県守谷市",
      });
    const projectId = survey.body.projectId;
    const sketchRes = await request(app)
      .post(`/api/survey/v1/projects/${projectId}/drawing-sketches`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "連携図面" });
    const sketchId = sketchRes.body.sketch.id;
    await request(app)
      .patch(`/api/survey/v1/drawing-sketches/${sketchId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
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
      });
    const preview = await request(app)
      .get(`/api/master/v1/estimate-preview?sketchId=${sketchId}`)
      .set("Authorization", `Bearer ${token}`);
    const saved = await request(app)
      .post("/api/master/v1/estimate-preview/apply")
      .set("Authorization", `Bearer ${token}`)
      .send({ sketchId, preview: preview.body });
    const imported = await request(app)
      .post(`/api/estimate/v1/from-master-draft/${saved.body.draft.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(imported.status, 201);
    assert.ok(imported.body.estimate?.items?.length >= 1);
    assert.equal(imported.body.masterDraftId, saved.body.draft.id);
    const first = imported.body.estimate.items[0];
    assert.ok(first.unitPrice > 0);
    assert.ok(String(first.memo || "").includes("[マスター]"));
  });

  it("案件 soft-delete 後は見積・請求一覧から除外される", async () => {
    const est = await request(app)
      .post("/api/estimate/v1/standalone-estimate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        addressee: "一括削除テスト株式会社",
        subject: "削除確認見積",
        items: [{ name: "カメラ", quantity: 1, unitPrice: 10000, unit: "式" }],
      });
    assert.equal(est.status, 201, est.body?.error);
    const bizId = est.body.businessProjectId;
    const inv = await request(app)
      .post(`/api/estimate/v1/projects/${bizId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(inv.status, 201, inv.body?.error);

    const beforeProjects = await request(app)
      .get("/api/estimate/v1/projects?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(beforeProjects.status, 200);
    assert.ok(beforeProjects.body.projects.some((p: { businessProjectId: string }) => p.businessProjectId === bizId));

    const beforeInvoices = await request(app)
      .get("/api/estimate/v1/invoices?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(beforeInvoices.status, 200);
    assert.ok(beforeInvoices.body.projects.some((p: { businessProjectId: string }) => p.businessProjectId === bizId));

    const del = await request(app)
      .delete(`/api/projects/v1/projects/${bizId}?source=business`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 200, del.body?.error);

    const afterProjects = await request(app)
      .get("/api/estimate/v1/projects?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(afterProjects.status, 200);
    assert.ok(!afterProjects.body.projects.some((p: { businessProjectId: string }) => p.businessProjectId === bizId));

    const afterInvoices = await request(app)
      .get("/api/estimate/v1/invoices?customerCode=TOMS001")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(afterInvoices.status, 200);
    assert.ok(!afterInvoices.body.projects.some((p: { businessProjectId: string }) => p.businessProjectId === bizId));
  });

  it("estimate list UI has card delete and confirm dialog", async () => {
    const html = await request(app).get("/estimate-v1.html");
    assert.equal(html.status, 200);
    assert.match(html.text, /btn-select-mode/);
    assert.match(html.text, /delete-dialog-overlay/);
    assert.match(html.text, /id="delete-dialog-confirm"/);
    assert.match(html.text, />OK</);

    const js = await request(app).get("/js/estimate-v1.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /listCardDeleteBtnHtml/);
    assert.match(js.text, /showDeleteConfirmDialog/);
    assert.match(js.text, /を削除してもよろしいですか？/);
    assert.match(js.text, /data-action="delete"/);
  });
});

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

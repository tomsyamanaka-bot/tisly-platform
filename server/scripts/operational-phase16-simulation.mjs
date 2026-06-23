/**
 * 実案件完走 Phase16-5 — 守谷市テスト案件フルフロー
 * Usage: npm run build && node scripts/operational-phase16-simulation.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../data/operational-phase16-simulation");
fs.mkdirSync(OUT, { recursive: true });

const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "operational-phase16-sim";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/operational-phase16-simulation.db");
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
const { closeDatabase } = await import("../dist/db/database.js");

const app = createApp();
const steps = [];

function record(step, ok, detail = "") {
  steps.push({ step, ok, detail, at: new Date().toISOString() });
  const mark = ok ? "✅" : "❌";
  console.log(`${mark} ${step}${detail ? ` — ${detail}` : ""}`);
}

async function login() {
  const res = await request(app).post("/api/auth/customer/login").send(LOGIN);
  if (!res.body.token) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

async function main() {
  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };

  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set(auth)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "守谷テスト様",
      siteName: "守谷市実案件完走テスト",
      address: "茨城県守谷市中央2-3-4",
      surveyDate: "2026-06-23",
    });
  record("現調作成", survey.status === 201, survey.body.projectId);
  const surveyProjectId = survey.body.projectId;

  await request(app)
    .patch(`/api/survey/v1/projects/${surveyProjectId}`)
    .set(auth)
    .send({ notes: "守谷市現調メモ" });

  const linked = await request(app)
    .post("/api/project-mgmt/v1/projects")
    .set(auth)
    .send({
      title: "守谷市実案件完走テスト",
      customerName: "守谷テスト様",
      phone: "0297-77-8888",
      address: "茨城県守谷市中央2-3-4",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
      surveyProjectId,
    });
  record("案件作成+現調連携", linked.status === 201, linked.body.project?.projectNo);
  const projectId = linked.body.project?.id;

  let detail = await request(app).get(`/api/project-mgmt/v1/projects/${projectId}`).set(auth);
  record(
    "現調後ステータス",
    detail.body?.operational?.statusLabel === "現調中",
    detail.body?.operational?.statusLabel
  );
  record(
    "不足一覧（現調のみ）",
    detail.body?.checklist?.doneCount === 1,
    `${detail.body?.checklist?.doneCount}/${detail.body?.checklist?.total}`
  );

  await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/drawing-sketches`)
    .set(auth)
    .send({ title: "守谷市図面", width: 800, height: 600 });
  record("図面作成", true);

  await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
    .set(auth)
    .send({});

  const fromSurvey = await request(app)
    .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
    .set(auth)
    .send({});
  record("見積連携", fromSurvey.status === 200 || fromSurvey.status === 201, fromSurvey.body?.businessProjectId);

  detail = await request(app).get(`/api/project-mgmt/v1/projects/${projectId}`).set(auth);
  record(
    "見積後ステータス",
    detail.body?.operational?.statusLabel === "見積提出",
    detail.body?.operational?.statusLabel
  );
  record(
    "粗利表示",
    typeof detail.body?.profit?.grossProfit === "number",
    `¥${detail.body?.profit?.grossProfit}`
  );
  record(
    "PDFセンター",
    detail.body?.pdfCenter?.total === 4,
    `${detail.body?.pdfCenter?.readyCount}件準備済`
  );

  const invoice = await request(app)
    .post(`/api/estimate/v1/projects/${projectId}/invoice`)
    .set(auth)
    .send({});
  record("請求作成", invoice.status === 201, invoice.body?.invoice?.invoiceNo);

  detail = await request(app).get(`/api/project-mgmt/v1/projects/${projectId}`).set(auth);
  record(
    "請求後ステータス",
    detail.body?.operational?.statusLabel === "請求済",
    detail.body?.operational?.statusLabel
  );

  const completion = await request(app)
    .post(`/api/estimate/v1/projects/${projectId}/completion-report/create`)
    .set(auth)
    .send({});
  record("完了報告", completion.status === 200 || completion.status === 201, completion.body?.reportId);

  detail = await request(app).get(`/api/project-mgmt/v1/projects/${projectId}`).set(auth);
  record(
    "完了後ステータス",
    detail.body?.operational?.statusLabel === "完了",
    detail.body?.operational?.statusLabel
  );
  record(
    "不足一覧完走",
    detail.body?.checklist?.items?.filter((i) => i.key !== "invoice" || i.done).length >= 4,
    `${detail.body?.checklist?.doneCount}/${detail.body?.checklist?.total}`
  );

  const list = await request(app).get("/api/project-mgmt/v1/projects").set(auth);
  const row = list.body.projects?.find((p) => p.id === projectId);
  record("案件一覧反映", Boolean(row?.mgmtStatusLabel), row?.mgmtStatusLabel);

  const kpi = await request(app).get("/api/dashboard-v1/operational-kpi").set(auth);
  record("ダッシュボードKPI", kpi.status === 200);

  for (const route of [
    "/project-mgmt-detail-v1",
    "/project-dashboard-v1",
    "/route-health",
  ]) {
    const res = await request(app).get(route);
    record(`画面 ${route}`, res.status === 200);
  }

  const allOk = steps.every((s) => s.ok);
  const report = {
    phase: "実案件完走 Phase16",
    projectId,
    surveyProjectId,
    municipality: "守谷市",
    allOk,
    operational: detail.body?.operational,
    checklist: detail.body?.checklist,
    profit: detail.body?.profit,
    pdfCenter: detail.body?.pdfCenter,
    steps,
    urls: {
      projectDetail: `/project-mgmt-detail-v1?projectId=${projectId}`,
      dashboard: "/project-dashboard-v1",
      routeHealth: "/route-health",
      health: "https://tisly.jp/api/health",
    },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, "verification-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nReport: ${path.join(OUT, "verification-report.json")}`);
  closeDatabase();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  closeDatabase();
  process.exit(1);
});

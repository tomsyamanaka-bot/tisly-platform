/**
 * 実運用フェーズ1 Phase15 — 守谷市テスト案件シミュレーション
 * Usage: npm run build && node scripts/operational-phase1-simulation.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../data/operational-phase1-simulation");
fs.mkdirSync(OUT, { recursive: true });

const LOGIN = {
  customerCode: process.env.TISLY_CUSTOMER_CODE || "TOMS001",
  username: process.env.TISLY_USERNAME || "toms001.surveyor",
  password: process.env.TISLY_DEMO_PASSWORD || "demo-remote-2026",
};

process.env.JWT_SECRET = process.env.JWT_SECRET || "operational-phase1-sim";
process.env.CUSTOMER_DEMO_PASSWORD = LOGIN.password;
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = path.join(__dirname, "../data/operational-phase1-simulation.db");
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

  const created = await request(app)
    .post("/api/project-mgmt/v1/projects")
    .set(auth)
    .send({
      title: "守谷市テスト案件",
      customerName: "守谷テスト様",
      phone: "0297-77-8888",
      address: "茨城県守谷市中央2-3-4",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
    });
  record("案件作成", created.status === 201, created.body.project?.projectNo);
  let projectId = created.body.project?.id;

  const survey = await request(app)
    .post("/api/survey/v1/projects")
    .set(auth)
    .send({
      customerCode: LOGIN.customerCode,
      customerName: "守谷テスト様",
      siteName: "守谷市テスト案件",
      address: "茨城県守谷市中央2-3-4",
      surveyDate: "2026-06-23",
    });
  record("現調作成", survey.status === 201, survey.body.projectId);
  const surveyProjectId = survey.body.projectId;

  await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/photos`)
    .set(auth)
    .send({
      imageBase64:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      comment: "現調テスト写真",
    });

  const linked = await request(app)
    .post("/api/project-mgmt/v1/projects")
    .set(auth)
    .send({
      title: "守谷市テスト案件（連携）",
      customerName: "守谷テスト様",
      phone: "0297-77-8888",
      address: "茨城県守谷市中央2-3-4",
      municipality: "守谷市",
      assignee: "山中",
      cityCode: "MO",
      surveyProjectId,
    });
  record("現調連携", linked.status === 201, surveyProjectId);
  projectId = linked.body.project?.id ?? projectId;

  const sketch = await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/drawing-sketches`)
    .set(auth)
    .send({ title: "守谷市図面", width: 800, height: 600 });
  record("図面作成", sketch.status === 201 || sketch.status === 200, sketch.body?.sketch?.id);

  await request(app)
    .post(`/api/survey/v1/projects/${surveyProjectId}/estimate-pending`)
    .set(auth)
    .send({});

  const fromSurvey = await request(app)
    .post(`/api/estimate/v1/from-survey/${surveyProjectId}`)
    .set(auth)
    .send({});
  record("見積連携", fromSurvey.status === 200 || fromSurvey.status === 201, fromSurvey.body?.businessProjectId);

  const detailMid = await request(app)
    .get(`/api/project-mgmt/v1/projects/${projectId}`)
    .set(auth);
  record(
    "進捗確認（中間）",
    detailMid.status === 200,
    `${detailMid.body?.operational?.progress?.percent}% · ${detailMid.body?.operational?.statusLabel}`
  );

  const timeline = await request(app)
    .get(`/api/project-timeline-v1/${projectId}`)
    .set(auth);
  record("タイムライン", timeline.status === 200, `${timeline.body.events?.length ?? 0}件`);

  const kpi = await request(app).get("/api/dashboard-v1/operational-kpi").set(auth);
  record("ダッシュボードKPI", kpi.status === 200, `${kpi.body.operational?.cards?.length ?? 0}カード`);

  const routes = [
    "/project-mgmt-detail-v1",
    "/project-dashboard-v1",
    "/survey-v1",
    "/survey-drawing-v1",
    "/estimate-v1",
    "/projects-v1",
    "/route-health",
  ];
  for (const route of routes) {
    const res = await request(app).get(route);
    record(`画面 ${route}`, res.status === 200);
  }

  const allOk = steps.every((s) => s.ok);
  const report = {
    phase: "実運用フェーズ1 Phase15",
    projectId,
    surveyProjectId,
    municipality: "守谷市",
    allOk,
    steps,
    urls: {
      projectDetail: `/project-mgmt-detail-v1?projectId=${projectId}`,
      dashboard: "/project-dashboard-v1",
      routeHealth: "/route-health",
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

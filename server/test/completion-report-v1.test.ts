import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-completion-report-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-completion-report-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.STORAGE_PROVIDER = "mock";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

describe("Completion Report PDF v2 — photo slots", () => {
  let token = "";
  let projectId = "";
  let slotIds: string[] = [];

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
    token = login.body.token;

    const tplRes = await request(app)
      .get("/api/project-automation/v1/templates")
      .set("Authorization", `Bearer ${token}`);
    const camera = tplRes.body.templates.find((t: { name: string }) => t.name === "防犯カメラ工事");
    assert.ok(camera);

    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "完了報告スロット検証現場",
        customerName: "スロット検証様",
        cityCode: "MO",
        templateId: camera.id,
      });
    assert.equal(created.status, 201);
    projectId = created.body.project.id;

    const photosRes = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/completion-report-photos`)
      .set("Authorization", `Bearer ${token}`);
    slotIds = photosRes.body.photos.map((p: { photoSlotId: string }) => p.photoSlotId);
    assert.equal(slotIds.length, 6);

    const slotNames = ["施工前全景", "施工後全景", "カメラ近景"];
    for (let i = 0; i < 3; i++) {
      const upload = await request(app)
        .post("/api/documents/v1/upload")
        .set("Authorization", `Bearer ${token}`)
        .send({
          projectId,
          documentType: "photo",
          sourceType: "photo",
          title: slotNames[i],
          fileName: `slot-${i + 1}.png`,
          fileBase64: `data:image/png;base64,${TINY_PNG}`,
          mimeType: "image/png",
          projectPhotoId: slotIds[i],
        });
      assert.equal(upload.status, 201, upload.body?.error);
    }
  });

  after(() => closeDatabase());

  it("completion-report-photos API がスロット順・missing を返す", async () => {
    const res = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/completion-report-photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.photos.length, 6);
    const shot = res.body.photos.filter((p: { hasPhoto: boolean }) => p.hasPhoto);
    const missing = res.body.photos.filter((p: { missing: boolean }) => p.missing);
    assert.equal(shot.length, 3);
    assert.equal(missing.length, 3);
    assert.equal(res.body.photos[0].photoSlotName, "施工前全景");
    assert.equal(res.body.photos[1].photoSlotName, "施工後全景");
    assert.equal(res.body.photos[2].photoSlotName, "カメラ近景");
    assert.ok(res.body.photos[0].localPath);
    assert.equal(res.body.photos[3].missing, true);
  });

  it("撮影済みスロットのみ photoOrder 順で完了報告書PDFに載る", async () => {
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${projectId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(cr.status, 200);
    assert.ok(cr.text.includes("施工前全景"));
    assert.ok(cr.text.includes("施工後全景"));
    assert.ok(cr.text.includes("カメラ近景"));
    assert.ok(!cr.text.includes("NVR"));
    assert.ok(!cr.text.includes("モニター画面"));
    assert.ok(!cr.text.includes("開始時間"));
    assert.ok(!cr.text.includes("使用部材"));
    assert.ok(cr.text.includes("株式会社TOMS"));
    const idxBefore = cr.text.indexOf("施工前全景");
    const idxAfter = cr.text.indexOf("施工後全景");
    const idxCamera = cr.text.indexOf("カメラ近景");
    assert.ok(idxBefore < idxAfter && idxAfter < idxCamera);
  });

  it("caption があれば photoSlotName より優先される", async () => {
    await request(app)
      .patch(`/api/project-automation/v1/projects/${projectId}/photos/${slotIds[0]}/link`)
      .set("Authorization", `Bearer ${token}`)
      .send({ caption: "カスタムキャプション" });
    const cr = await request(app)
      .get(`/api/estimate/v1/projects/${projectId}/completion-report/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(cr.status, 200);
    assert.ok(cr.text.includes("カスタムキャプション"));
  });
});

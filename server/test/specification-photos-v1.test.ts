import { describe, it, before, after } from "node:test";
import fs from "fs";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-specification-photos-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-specification-photos-v1.db";
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

describe("Specification PDF v2 — spec photo slots", () => {
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
        title: "仕様書スロット検証現場",
        customerName: "仕様書スロット検証様",
        cityCode: "MO",
        templateId: camera.id,
      });
    assert.equal(created.status, 201);
    projectId = created.body.project.id;

    const photosRes = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/specification-photos`)
      .set("Authorization", `Bearer ${token}`);
    slotIds = photosRes.body.photos.map((p: { photoSlotId: string }) => p.photoSlotId);
    assert.equal(slotIds.length, 8);

    const slotNames = ["建物外観", "玄関", "設置予定位置"];
    for (let i = 0; i < 3; i++) {
      const upload = await request(app)
        .post("/api/documents/v1/upload")
        .set("Authorization", `Bearer ${token}`)
        .send({
          projectId,
          documentType: "photo",
          sourceType: "specification",
          title: slotNames[i],
          fileName: `spec-slot-${i + 1}.png`,
          fileBase64: `data:image/png;base64,${TINY_PNG}`,
          mimeType: "image/png",
          specProjectPhotoId: slotIds[i],
        });
      assert.equal(upload.status, 201, upload.body?.error);
    }
  });

  after(() => closeDatabase());

  it("specification-photos API がスロット順・missing を返す", async () => {
    const res = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/specification-photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.photos.length, 8);
    const shot = res.body.photos.filter((p: { hasPhoto: boolean }) => p.hasPhoto);
    const missing = res.body.photos.filter((p: { missing: boolean }) => p.missing);
    assert.equal(shot.length, 3);
    assert.equal(missing.length, 5);
    assert.equal(res.body.photos[0].photoSlotName, "建物外観");
    assert.equal(res.body.photos[1].photoSlotName, "玄関");
    assert.equal(res.body.photos[2].photoSlotName, "設置予定位置");
    assert.ok(res.body.photos[0].localPath);
    assert.equal(res.body.photos[3].missing, true);
    assert.ok(res.body.integrity);
    assert.equal(typeof res.body.integrity.mismatchCount, "number");
  });

  it("撮影済みスロットのみ photoOrder 順で仕様書PDFに載る", async () => {
    const spec = await request(app)
      .get(`/api/estimate/v1/projects/${projectId}/specification/pdf?format=html&live=1`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(spec.status, 200);
    assert.ok(spec.text.includes("建物外観"));
    assert.ok(spec.text.includes("玄関"));
    assert.ok(spec.text.includes("設置予定位置"));
    assert.ok(!spec.text.includes("配線ルート"));
    assert.ok(!spec.text.includes("盤内"));
    const idx0 = spec.text.indexOf("建物外観");
    const idx1 = spec.text.indexOf("玄関");
    const idx2 = spec.text.indexOf("設置予定位置");
    assert.ok(idx0 < idx1 && idx1 < idx2);
  });

  it("automation bundle に specPhotos 進捗が含まれる", async () => {
    const res = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.specPhotos.length, 8);
    assert.equal(res.body.progress.specPhotos.shot, 3);
    assert.equal(res.body.progress.specPhotos.total, 8);
  });

  it("merge apply で既存タスクを保持し仕様書スロットを追加", async () => {
    const legacy = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "マージ検証現場",
        customerName: "マージ検証様",
        cityCode: "MO",
      });
    assert.equal(legacy.status, 201);
    const legacyId = legacy.body.project.id;

    await request(app)
      .post(`/api/project-automation/v1/projects/${legacyId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "手動タスク" });

    const tplRes = await request(app)
      .get("/api/project-automation/v1/templates")
      .set("Authorization", `Bearer ${token}`);
    const camera = tplRes.body.templates.find((t: { name: string }) => t.name === "防犯カメラ工事");
    assert.ok(camera);

    await request(app)
      .post(`/api/project-automation/v1/projects/${legacyId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ templateId: camera.id, merge: true });

    const after = await request(app)
      .get(`/api/project-automation/v1/projects/${legacyId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(after.body.tasks.some((t: { label: string }) => t.label === "手動タスク"));
    assert.ok(after.body.tasks.length > 1);
    assert.equal(after.body.specPhotos.length, 8);
    assert.equal(after.body.templateId, camera.id);
  });

  it("spec-photos reorder で順番を変更できる", async () => {
    const before = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/specification-photos`)
      .set("Authorization", `Bearer ${token}`);
    const ids = before.body.photos.map((p: { photoSlotId: string }) => p.photoSlotId);
    const swapped = [ids[1], ids[0], ...ids.slice(2)];
    await request(app)
      .put(`/api/project-automation/v1/projects/${projectId}/spec-photos/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ orderedIds: swapped });
    const after = await request(app)
      .get(`/api/project-automation/v1/projects/${projectId}/specification-photos`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(after.body.photos[0].photoSlotName, "玄関");
    assert.equal(after.body.photos[1].photoSlotName, "建物外観");
  });
});

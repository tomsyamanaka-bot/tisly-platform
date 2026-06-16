import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-project-storage-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-project-storage-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.PROJECT_STORAGE_PROVIDER = "mock";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const { projectStorageRootDir } = await import("../src/storage/project-storage-v1.js");

const app = createApp();

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

async function ownerLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.owner", password: "demo-remote-2026" });
}

describe("QNAP連携 v1 — project-storage mock", () => {
  let token = "";
  let ownerToken = "";
  let projectId = "";
  let projectNo = "";

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

    const storageRoot = projectStorageRootDir();
    if (fs.existsSync(storageRoot)) {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }

    const login = await surveyorLogin();
    assert.equal(login.status, 200, login.body?.error);
    token = login.body.token;

    const owner = await ownerLogin();
    assert.equal(owner.status, 200, owner.body?.error);
    ownerToken = owner.body.token;

    const created = await request(app)
      .post("/api/project-mgmt/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "QNAP連携検証",
        customerName: "ストレージテスト様",
        municipality: "守谷市",
        address: "茨城県守谷市テスト2-2",
        assignee: "山中",
        cityCode: "MO",
      });
    assert.equal(created.status, 201, created.body?.error);
    projectId = created.body.project.id;
    projectNo = created.body.project.projectNo;
  });

  after(() => closeDatabase());

  it("案件作成でフォルダが自動生成される", () => {
    const root = projectStorageRootDir();
    const projectDir = path.join(root, projectNo);
    assert.ok(fs.existsSync(projectDir), `expected ${projectDir}`);
    for (const sub of [
      "01_現調",
      "02_見積",
      "03_請求",
      "04_仕様書",
      "05_完了報告",
      "06_写真",
      "07_図面",
      "08_その他",
    ]) {
      assert.ok(fs.existsSync(path.join(projectDir, sub)), sub);
    }
  });

  it("GET /api/project-storage/:projectId — 一覧", async () => {
    const res = await request(app)
      .get(`/api/project-storage/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.qnapFolderPath.includes("/案件/"));
    assert.equal(res.body.qnapSyncStatus, "pending");
    assert.equal(res.body.qnapSyncLabel, "未同期");
    assert.equal(res.body.folders.length, 8);
    assert.equal(res.body.files.length, 0);
    assert.equal(res.body.documents.length, 4);
    assert.equal(res.body.folderContents.length, 8);
    assert.equal(res.body.storageProvider, "mock");
  });

  it("POST create-folders は冪等", async () => {
    const res = await request(app)
      .post(`/api/project-storage/${projectId}/create-folders`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.projectNo, projectNo);
    assert.equal(res.body.folders.length, 8);
    assert.equal(res.body.created, false);
  });

  it("見積PDF保存 → mock storage に反映", async () => {
    const est = await request(app)
      .post(`/api/business/projects/${projectId}/estimate`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ name: "カメラ設置", quantity: 1, unitPrice: 50000 }],
      });
    assert.equal(est.status, 201, est.body?.error);

    const fin = await request(app)
      .post(`/api/estimate/v1/projects/${projectId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(fin.status, 200, fin.body?.error);

    const estimatePath = path.join(projectStorageRootDir(), projectNo, "02_見積");
    const estimateFiles = fs.readdirSync(estimatePath).filter((f) => f.endsWith(".pdf"));
    assert.ok(estimateFiles.length >= 1, estimatePath);
    assert.match(estimateFiles[0]!, /^見積書_.*\.pdf$/);

    const list = await request(app)
      .get(`/api/project-storage/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.qnapSyncStatus, "synced");
    const estFile = list.body.files.find((f: { kind: string }) => f.kind === "estimate");
    assert.ok(estFile);
    assert.match(estFile.fileName, /^見積書_.*\.pdf$/);
    assert.equal(estFile.viewerKind, "estimate");
  });

  it("POST regenerate-document — 見積を保存し直す", async () => {
    const res = await request(app)
      .post(`/api/project-storage/${projectId}/regenerate-document`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "estimate" });
    assert.equal(res.status, 200, res.body?.error);
    assert.match(res.body.fileName, /^見積書_.*\.pdf$/);
    assert.equal(res.body.folder, "02_見積");
    assert.equal(res.body.provider, "mock");
  });

  it("POST save-document — 手動保存", async () => {
    const res = await request(app)
      .post(`/api/project-storage/${projectId}/save-document`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "estimate" });
    assert.equal(res.status, 201);
    assert.match(res.body.fileName, /^見積書_.*\.pdf$/);
    assert.equal(res.body.folder, "02_見積");
  });

  it("請求・仕様書・完了報告書も mock storage に保存", async () => {
    const inv = await request(app)
      .post(`/api/estimate/v1/projects/${projectId}/invoice`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.ok([200, 201].includes(inv.status), inv.body?.error);

    const spec = await request(app)
      .post(`/api/projects/v1/projects/${projectId}/specification/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(spec.status, 200, spec.body?.error);

    const report = await request(app)
      .post(`/api/estimate/v1/projects/${projectId}/completion-report/create`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    assert.equal(report.status, 201, report.body?.error);

    const root = projectStorageRootDir();
    const projectDir = path.join(root, projectNo);
    for (const [sub, pattern] of [
      ["03_請求", /^請求書_.*\.pdf$/],
      ["04_仕様書", /^仕様書_.*\.pdf$/],
      ["05_完了報告", /^完了報告書_.*\.pdf$/],
    ] as const) {
      const dir = path.join(projectDir, sub);
      const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
      assert.ok(pdfs.length >= 1, sub);
      assert.match(pdfs[0]!, pattern);
    }

    const list = await request(app)
      .get(`/api/project-storage/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.qnapSyncStatus, "synced");
    for (const kind of ["estimate", "invoice", "specification", "report"]) {
      assert.ok(list.body.files.some((f: { kind: string }) => f.kind === kind), kind);
    }
    const specFolder = list.body.folderContents.find(
      (f: { folder: string }) => f.folder === "04_仕様書"
    );
    assert.ok(specFolder?.files?.length >= 1);
  });

  it("POST upload-file — 写真・図面・その他", async () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    for (const [folderType, sub] of [
      ["photos", "06_写真"],
      ["drawings", "07_図面"],
      ["others", "08_その他"],
    ] as const) {
      const res = await request(app)
        .post(`/api/project-storage/${projectId}/upload-file`)
        .set("Authorization", `Bearer ${token}`)
        .send({ folderType, fileName: `test-${folderType}.png`, fileBase64: tinyPng });
      assert.equal(res.status, 201, res.body?.error);
      assert.equal(res.body.folder, sub);
      const dir = path.join(projectStorageRootDir(), projectNo, sub);
      assert.ok(fs.readdirSync(dir).some((f) => f.includes("test-")));
    }
  });

  it("仕様書・完了報告保存で元写真も 06_写真 にミラー", async () => {
    const specDir = path.join(projectStorageRootDir(), projectNo, "06_写真", "仕様書");
    const reportDir = path.join(projectStorageRootDir(), projectNo, "06_写真", "完了報告");
    await request(app)
      .post(`/api/project-storage/${projectId}/save-document`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "specification" });
    await request(app)
      .post(`/api/project-storage/${projectId}/save-document`)
      .set("Authorization", `Bearer ${token}`)
      .send({ kind: "report" });
    if (fs.existsSync(specDir)) {
      const specPhotos = fs.readdirSync(specDir).filter((f) => f.startsWith("仕様書写真_"));
      assert.ok(specPhotos.length >= 0);
    }
    if (fs.existsSync(reportDir)) {
      const reportPhotos = fs.readdirSync(reportDir).filter((f) => f.startsWith("完了写真_"));
      assert.ok(reportPhotos.length >= 0);
    }
    const list = await request(app)
      .get(`/api/project-storage/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    const photosFolder = list.body.folderContents.find(
      (f: { folder: string }) => f.folder === "06_写真"
    );
    assert.ok(photosFolder);
  });
});

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
    for (const sub of ["01_現調", "02_見積", "03_請求", "04_仕様書", "05_完了報告"]) {
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
});

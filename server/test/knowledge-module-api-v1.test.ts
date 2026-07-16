import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-module-api-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-module-api-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  createKnowledgeModuleItemV1,
  listKnowledgeModuleItemsV1,
  parseKnowledgeModuleTagsFromText,
  saveKnowledgeModulePdfV1,
  getKnowledgeModulePdfUploadDir,
} = await import("../src/knowledge/knowledge-module-v1.js");
const {
  FAB_FINISH_MODULE_SEED_IDS,
  getFabFinishModuleSeedItemsV1,
  seedFabFinishKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-fab-finish-seed-v1.js");
const { getKnowledgeCardV1 } = await import("../src/knowledge/knowledge-store-v1.js");

const app = createApp();
const moduleItemsPath = path.join(process.cwd(), "data", "knowledge", "module-items.json");

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

/** 仕上げシード以外を消して初期状態に戻す */
function cleanupModuleData() {
  try {
    const seeds = getFabFinishModuleSeedItemsV1();
    fs.mkdirSync(path.dirname(moduleItemsPath), { recursive: true });
    fs.writeFileSync(moduleItemsPath, JSON.stringify(seeds, null, 2), "utf8");
  } catch {
    /* */
  }
  const pdfDir = getKnowledgeModulePdfUploadDir();
  if (fs.existsSync(pdfDir)) {
    for (const f of fs.readdirSync(pdfDir)) {
      try {
        fs.unlinkSync(path.join(pdfDir, f));
      } catch {
        /* */
      }
    }
  }
}

describe("knowledge-module-v1 store", () => {
  before(() => cleanupModuleData());
  after(() => cleanupModuleData());

  it("parseKnowledgeModuleTagsFromText splits comma, space, hash", () => {
    assert.deepEqual(parseKnowledgeModuleTagsFromText("IoT, 施工方法 #PLC"), [
      "IoT",
      "施工方法",
      "PLC",
    ]);
  });

  it("createKnowledgeModuleItemV1 persists tags and pdf_url", () => {
    const item = createKnowledgeModuleItemV1({
      title: "テストPDF",
      summary: "概要テスト",
      genre: "IoT",
      tags: ["IoT", "施工方法"],
      pdf_url: "/uploads/knowledge/module/sample.pdf",
    });
    assert.equal(item.pdf_url, "/uploads/knowledge/module/sample.pdf");
    assert.deepEqual(item.tags, ["IoT", "施工方法"]);
    const listed = listKnowledgeModuleItemsV1();
    assert.ok(listed.some((x) => x.id === item.id));
  });

  it("createKnowledgeModuleItemV1 allows empty summary when pdf_url is set", () => {
    const item = createKnowledgeModuleItemV1({
      title: "PDFのみ",
      summary: "",
      genre: "IoT",
      pdf_url: "/uploads/knowledge/module/sample.pdf",
    });
    assert.equal(item.summary, "");
    assert.equal(item.pdf_url, "/uploads/knowledge/module/sample.pdf");
  });

  it("createKnowledgeModuleItemV1 rejects empty summary without pdf_url", () => {
    assert.throws(
      () =>
        createKnowledgeModuleItemV1({
          title: "メモなし",
          summary: "",
          genre: "IoT",
        }),
      /summary is required when no PDF is attached/
    );
  });

  it("saveKnowledgeModulePdfV1 rejects non-PDF", () => {
    assert.throws(
      () =>
        saveKnowledgeModulePdfV1({
          fileName: "note.txt",
          fileBase64: Buffer.from("hello").toString("base64"),
        }),
      /Only PDF/
    );
  });

  it("saveKnowledgeModulePdfV1 stores valid PDF", () => {
    const pdfBytes = Buffer.from("%PDF-1.4 test content");
    const result = saveKnowledgeModulePdfV1({
      fileName: "manual.pdf",
      fileBase64: pdfBytes.toString("base64"),
    });
    assert.match(result.pdf_url, /^\/uploads\/knowledge\/module\/.*\.pdf$/);
    const diskPath = path.join(process.cwd(), result.pdf_url.replace(/^\//, ""));
    assert.ok(fs.existsSync(diskPath));
  });

  it("listKnowledgeModuleItemsV1 includes fab-finish seed knowhow", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of FAB_FINISH_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    assert.ok(listed.some((x) => x.title.includes("パテ盛り")));
    assert.ok(listed.some((x) => x.tags.includes("製作ノウハウ")));
    assert.ok(listed.some((x) => x.title.includes("スカイブ")));
  });

  it("seedFabFinishKnowledgeCardsV1 upserts searchable cards", () => {
    seedFabFinishKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FAB-PUTTY-SAND-001");
    assert.ok(card);
    assert.match(card!.title, /パテ盛り/);
    assert.ok(card!.tags.includes("製作ノウハウ"));
    assert.equal(card!.category, "その他");
  });
});

describe("knowledge-module-v1 API", () => {
  let token = "";

  before(async () => {
    cleanupModuleData();
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
  });

  after(() => cleanupModuleData());

  it("POST /module-v1/items creates item with tags", async () => {
    const res = await request(app)
      .post("/api/knowledge/module-v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "APIテスト",
        summary: "タグ付き登録",
        genre: "制御",
        tags: ["PLC", "施工方法"],
        pdf_url: null,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.item.title, "APIテスト");
    assert.deepEqual(res.body.item.tags, ["PLC", "施工方法"]);
    assert.equal(res.body.item.pdf_url, null);
  });

  it("POST /module-v1/items rejects empty summary without pdf_url", async () => {
    const res = await request(app)
      .post("/api/knowledge/module-v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "メモなし",
        summary: "",
        genre: "IoT",
        pdf_url: null,
      });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error ?? ""), /summary is required/);
  });

  it("POST /module-v1/upload-pdf + GET items returns pdf_url", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 api test");
    const upload = await request(app)
      .post("/api/knowledge/module-v1/upload-pdf")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fileName: "api-test.pdf",
        fileBase64: pdfBytes.toString("base64"),
      });
    assert.equal(upload.status, 201);
    assert.match(upload.body.pdf_url, /\/uploads\/knowledge\/module\//);

    const create = await request(app)
      .post("/api/knowledge/module-v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "PDF付き",
        summary: "添付テスト",
        genre: "IoT",
        tags: ["IoT"],
        pdf_url: upload.body.pdf_url,
      });
    assert.equal(create.status, 201);
    assert.equal(create.body.item.pdf_url, upload.body.pdf_url);

    const createPdfOnly = await request(app)
      .post("/api/knowledge/module-v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "PDFのみタイトル",
        summary: "",
        genre: "IoT",
        tags: ["IoT"],
        pdf_url: upload.body.pdf_url,
      });
    assert.equal(createPdfOnly.status, 201);
    assert.equal(createPdfOnly.body.item.summary, "");
    assert.equal(createPdfOnly.body.item.pdf_url, upload.body.pdf_url);

    const list = await request(app)
      .get("/api/knowledge/module-v1/items")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.tags));
    assert.ok(list.body.items.some((x: { pdf_url: string }) => x.pdf_url === upload.body.pdf_url));
  });

  it("GET uploaded PDF is served statically", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 static serve");
    const upload = await request(app)
      .post("/api/knowledge/module-v1/upload-pdf")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fileName: "static.pdf",
        fileBase64: pdfBytes.toString("base64"),
      });
    const res = await request(app).get(upload.body.pdf_url);
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /pdf|octet-stream/i);
  });
});

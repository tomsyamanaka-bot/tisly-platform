import { describe, it, before, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-module-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-module-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");

const app = createApp();
const publicDir = path.resolve("public");

describe("knowledge-module-v1 PWA", () => {
  before(() => {});

  after(async () => {
    await closeDatabase();
  });

  it("GET /knowledge-module-v1 returns HTML shell", async () => {
    const res = await request(app).get("/knowledge-module-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /id="kn-root"/);
    assert.doesNotMatch(res.text, /knowledge-module\.bundle\.js/);
    assert.match(res.text, /knowledge-module-v1-nav\.js/);
    assert.match(res.text, /tisly-practical-nav\.css/);
  });

  it("bundle uses API routes and has no mock fallback toast", () => {
    const bundlePath = path.join(
      publicDir,
      "js/features/knowledge/knowledge-module.bundle.js"
    );
    assert.ok(fs.existsSync(bundlePath), "bundle must exist — run npm run build:knowledge-module");
    const src = fs.readFileSync(bundlePath, "utf8");
    assert.doesNotMatch(src, /kn-mock-cola-silo/);
    assert.doesNotMatch(src, /モック表示/);
    assert.match(src, /module-v1\/items/);
    assert.match(src, /module-v1\/upload-pdf/);
    assert.match(src, /kn-genre-tab/);
    assert.match(src, /data-genre/);
    assert.match(src, /kn-genre-tabs/);
    const mockPath = path.join(publicDir, "js/features/knowledge/data/mockKnowledge.ts");
    const mockSrc = fs.readFileSync(mockPath, "utf8");
    assert.match(mockSrc, /防犯カメラ/);
    assert.match(mockSrc, /セキュリティー/);
    assert.match(mockSrc, /TV工事/);
    assert.match(mockSrc, /空調/);
    assert.match(mockSrc, /製作ノウハウ/);
    assert.match(mockSrc, /パテ盛り＋サンディング/);
    assert.match(mockSrc, /プラサフ/);
    assert.match(mockSrc, /スカイブ接合/);
    assert.match(mockSrc, /Eco-Water/);
    assert.match(mockSrc, /工業用・水質pHセンサーの耐久性と寿命基準/);
    assert.match(mockSrc, /クエン酸洗浄/);
  });

  it("nav script requires login before loading bundle", () => {
    const navPath = path.join(publicDir, "js/knowledge-module-v1-nav.js");
    const src = fs.readFileSync(navPath, "utf8");
    assert.match(src, /requireCustomerLogin/);
    assert.match(src, /knowledge-module\.bundle\.js/);
  });

  it("TSX source files exist under features/knowledge", () => {
    const base = path.join(publicDir, "js/features/knowledge");
    assert.ok(fs.existsSync(path.join(base, "components/SearchBar.tsx")));
    assert.ok(fs.existsSync(path.join(base, "components/KnowledgeCard.tsx")));
    assert.ok(fs.existsSync(path.join(base, "components/TagInput.tsx")));
    assert.ok(fs.existsSync(path.join(base, "components/PdfUpload.tsx")));
    assert.ok(fs.existsSync(path.join(base, "api/knowledgeModuleApi.ts")));
    assert.ok(fs.existsSync(path.join(base, "pages/index.tsx")));
  });

  it("bundle includes PDF upload and tag input UI", () => {
    const bundlePath = path.join(
      publicDir,
      "js/features/knowledge/knowledge-module.bundle.js"
    );
    const src = fs.readFileSync(bundlePath, "utf8");
    assert.match(src, /kn-tag-input/);
    assert.match(src, /kn-pdf-drop/);
    assert.match(src, /module-v1\/items/);
    assert.match(src, /module-v1\/upload-pdf/);
    assert.match(src, /kn-media-gallery/);
    assert.match(src, /\.tags\.join\(/);
    assert.match(
      src,
      /application\/pdf,image\/\*,video\/\*/
    );
    // esbuild は日本語を \uXXXX 化する
    assert.match(src, /\\u30D5\\u30A1\\u30A4\\u30EB\\u3092\\u6DFB\\u4ED8/);
    assert.match(src, /\\u30E1\\u30C7\\u30A3\\u30A2\\u30FB\\u30D5\\u30A1\\u30A4\\u30EB\\u6DFB\\u4ED8/);
    assert.match(src, /kn-media-thumb/);
    assert.match(src, /kn-attachment-grid/);
    assert.match(src, /kn-media-gallery/);
    assert.match(src, /multiple:/);
    assert.match(src, /module-v1\/items\//);
  });

  it("mediaAttachment util and PdfUpload accept media", () => {
    const utilPath = path.join(
      publicDir,
      "js/features/knowledge/utils/mediaAttachment.ts"
    );
    assert.ok(fs.existsSync(utilPath));
    const utilSrc = fs.readFileSync(utilPath, "utf8");
    assert.match(utilSrc, /detectKnowledgeMediaKind/);
    assert.match(utilSrc, /\.heic/);
    assert.match(utilSrc, /\.mp4/);

    const uploadSrc = fs.readFileSync(
      path.join(publicDir, "js/features/knowledge/components/PdfUpload.tsx"),
      "utf8"
    );
    assert.match(uploadSrc, /ファイルを添付（PDF・写真・動画）/);
    assert.match(uploadSrc, /application\/pdf,image\/\*,video\/\*/);
    assert.match(uploadSrc, /\bmultiple\b/);
    assert.match(uploadSrc, /＋ ファイルを追加/);
    assert.match(uploadSrc, /kn-attachment-remove/);

    const pageSrc = fs.readFileSync(
      path.join(publicDir, "js/features/knowledge/pages/index.tsx"),
      "utf8"
    );
    assert.match(pageSrc, /メディア・ファイル添付（PDF \/ 写真 \/ 動画）/);
    assert.match(pageSrc, /updateKnowledgeModuleItem/);
    assert.match(pageSrc, /KnowledgeDetailDialog/);
    assert.match(pageSrc, /KnowledgeEditDialog/);
    assert.match(pageSrc, /kn-detail-body/);

    const cardSrc = fs.readFileSync(
      path.join(publicDir, "js/features/knowledge/components/KnowledgeCard.tsx"),
      "utf8"
    );
    assert.match(cardSrc, /KnowledgeMediaGallery/);
    assert.match(cardSrc, /normalizeKnowledgeMediaAttachments/);
  });
});

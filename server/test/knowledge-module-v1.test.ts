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
    assert.match(src, /IOT\\u95a2\\u9023/i);
    assert.match(src, /\\u96fb\\u6c17\\u5de5\\u4e8b/i);
    const mockPath = path.join(publicDir, "js/features/knowledge/data/mockKnowledge.ts");
    const mockSrc = fs.readFileSync(mockPath, "utf8");
    assert.match(mockSrc, /防犯カメラ/);
    assert.match(mockSrc, /セキュリティー/);
    assert.match(mockSrc, /TV工事/);
    assert.match(mockSrc, /空調/);
    assert.match(mockSrc, /電気工事/);
    assert.match(mockSrc, /IOT関連/);
    assert.match(mockSrc, /音響/);
    assert.match(mockSrc, /UNIFIED_GENRE_FILTER_TABS/);
    assert.match(mockSrc, /製作ノウハウ/);
    assert.match(mockSrc, /パテ盛り＋サンディング/);
    assert.match(mockSrc, /プラサフ/);
    assert.match(mockSrc, /スカイブ接合/);
    assert.match(mockSrc, /Eco-Water/);
    assert.match(mockSrc, /工業用・水質pHセンサーの耐久性と寿命基準/);
    assert.match(mockSrc, /クエン酸洗浄/);
    assert.match(mockSrc, /RS485・Modbus通信の結線と不通トラブルシューティング/);
    assert.match(mockSrc, /pHセンサーの標準液校正/);
    assert.match(mockSrc, /水質センサーの現場配管・浸漬設置基準/);
    assert.match(mockSrc, /フロア俯瞰図連動とミリ波レーダー/);
    assert.match(mockSrc, /防虫クリアイエロー塗装ハック/);
    assert.match(mockSrc, /ガスメーターパルス/);
    assert.match(mockSrc, /格安SIM/);
    assert.match(mockSrc, /ソフトウェアディレイ設計基準/);
    assert.match(mockSrc, /デバウンス黄金比/);
    assert.match(mockSrc, /アイソメトリック間取り図/);
    assert.match(mockSrc, /ハートビート5分周期化/);
    assert.match(mockSrc, /立体シールドエンブレム/);
    assert.match(mockSrc, /MOCK_OPS_INSIGHT_ITEMS/);
    assert.match(mockSrc, /ストリーミング比較設計/);
    assert.match(mockSrc, /サブストリーム統合/);
    assert.match(mockSrc, /PoEハブ給電ハック/);
    assert.match(mockSrc, /プライバシー保護型安否確認/);
    assert.match(mockSrc, /自動検針＆24時間見守り/);
    assert.match(mockSrc, /MOCK_SECURITY_STREAM_ITEMS/);
    assert.match(mockSrc, /Googleカレンダー自動同期/);
    assert.match(mockSrc, /MOCK_VOICE_CALL_ITEMS/);
    assert.match(mockSrc, /#VoiceAI/);
    assert.match(mockSrc, /即時STL生成/);
    assert.match(mockSrc, /MOCK_FACTORY_STL_ITEMS/);
    assert.match(mockSrc, /#TiSLY_Factory/);
    assert.match(mockSrc, /Revopoint MINI 2/);
    assert.match(mockSrc, /MOCK_REVOPOINT_SCAN_ITEMS/);
    assert.match(mockSrc, /#リバースエンジニアリング/);
    assert.match(mockSrc, /ハイブリッド保存設計/);
    assert.match(mockSrc, /MOCK_HYBRID_3D_STORE_ITEMS/);
    assert.match(mockSrc, /#IndexedDB/);
    assert.match(mockSrc, /パラメトリック差分更新/);
    assert.match(mockSrc, /寸法ナンバリング/);
    assert.match(mockSrc, /MOCK_PARAMETRIC_3D_ITEMS/);
    assert.match(mockSrc, /#パラメトリック設計/);
    assert.match(mockSrc, /QNAP\/IndexedDBハイブリッド保存/);
    assert.match(mockSrc, /リアルタイム差分更新UI/);
    assert.match(mockSrc, /AR原寸重ね合わせ/);
    assert.match(mockSrc, /MOCK_FACTORY_DX_PART1_ITEMS/);
    assert.match(mockSrc, /#AR干渉チェック/);
    assert.match(mockSrc, /ハイブリッド出力＆結合アセンブリ/);
    assert.match(mockSrc, /積層強度AIガイド/);
    assert.match(mockSrc, /インサートナット熱圧入/);
    assert.match(mockSrc, /端子モールド一体成形/);
    assert.match(mockSrc, /MOCK_FACTORY_DX_PART2_ITEMS/);
    assert.match(mockSrc, /#ELEGOO/);
    assert.match(mockSrc, /単管マウント架台/);
    assert.match(mockSrc, /MOCK_IR_BEAM_MOUNT_ITEMS/);
    assert.match(mockSrc, /#TiSLY_Security/);
    assert.match(mockSrc, /RJ45ビームセンサーハウジング/);
    assert.match(mockSrc, /MOCK_RJ45_BEAM_HOUSING_ITEMS/);
    assert.match(mockSrc, /#自社ブランド化/);
    assert.match(mockSrc, /TD-SM5030CT-BSH/);
    assert.match(mockSrc, /MOCK_SMART_INTERCOM_ITEMS/);
    assert.match(mockSrc, /#スマートドアホン/);
    assert.match(mockSrc, /TiSLY HOME統合仕様/);
    assert.match(mockSrc, /MOCK_HOME_INTERCOM_ITEMS/);
    assert.match(mockSrc, /#TiSLY_HOME/);
    assert.match(mockSrc, /自然言語・音声プロンプト/);
    assert.match(mockSrc, /MOCK_TEXT_TO_3D_ITEMS/);
    assert.match(mockSrc, /#TextTo3D/);
    assert.match(mockSrc, /マルチアングル方眼紙/);
    assert.match(mockSrc, /MOCK_MULTI_ANGLE_SKETCH_ITEMS/);
    assert.match(mockSrc, /#GeminiVision/);
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
    assert.match(pageSrc, /UNIFIED_GENRE_FILTER_TABS/);
    assert.match(pageSrc, /itemMatchesUnifiedGenreV1/);

    const cardSrc = fs.readFileSync(
      path.join(publicDir, "js/features/knowledge/components/KnowledgeCard.tsx"),
      "utf8"
    );
    assert.match(cardSrc, /KnowledgeMediaGallery/);
    assert.match(cardSrc, /normalizeKnowledgeMediaAttachments/);
  });
});

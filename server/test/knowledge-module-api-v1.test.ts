import { describe, it, before, after } from "node:test";
import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-knowledge-module-api-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-knowledge-module-api-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.KNOWLEDGE_MODULE_DATA_DIR = "./data/test-knowledge-module-api-v1";
process.env.KNOWLEDGE_MODULE_UPLOAD_DIR = "./uploads/knowledge/test-module-api-v1";
process.env.KNOWLEDGE_MODULE_UPLOAD_URL_PREFIX = "/uploads/knowledge/test-module-api-v1";

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase, getDatabase } = await import("../src/db/database.js");
const {
  createKnowledgeModuleItemV1,
  listKnowledgeModuleItemsV1,
  parseKnowledgeModuleTagsFromText,
  saveKnowledgeModulePdfV1,
  getKnowledgeModulePdfUploadDir,
  normalizeKnowledgeModuleMediasV1,
  updateKnowledgeModuleItemV1,
} = await import("../src/knowledge/knowledge-module-v1.js");
const {
  FAB_FINISH_MODULE_SEED_IDS,
  getFabFinishModuleSeedItemsV1,
  seedFabFinishKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-fab-finish-seed-v1.js");
const {
  ECO_WATER_PH_MODULE_SEED_IDS,
  getEcoWaterPhModuleSeedItemsV1,
  seedEcoWaterPhKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-eco-water-ph-seed-v1.js");
const {
  ECO_WATER_FIELD_MODULE_SEED_IDS,
  getEcoWaterFieldModuleSeedItemsV1,
  seedEcoWaterFieldKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-eco-water-field-seed-v1.js");
const {
  SECURITY_FLOOR_MODULE_SEED_IDS,
  seedSecurityFloorKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-security-floor-seed-v1.js");
const {
  OPS_INSIGHT_MODULE_SEED_IDS,
  seedOpsInsightKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-ops-insight-seed-v1.js");
const {
  SECURITY_STREAM_MODULE_SEED_IDS,
  seedSecurityStreamKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-security-stream-seed-v1.js");
const { getKnowledgeCardV1 } = await import("../src/knowledge/knowledge-store-v1.js");

const app = createApp();
const moduleItemsPath = path.join(
  process.cwd(),
  "data",
  "test-knowledge-module-api-v1",
  "module-items.json"
);

async function surveyorLogin() {
  return request(app)
    .post("/api/auth/customer/login")
    .send({ customerCode: "TOMS001", username: "toms001.surveyor", password: "demo-remote-2026" });
}

/** 仕上げシード以外を消して初期状態に戻す */
function cleanupModuleData() {
  try {
    const seeds = [
      ...getFabFinishModuleSeedItemsV1(),
      ...getEcoWaterPhModuleSeedItemsV1(),
      ...getEcoWaterFieldModuleSeedItemsV1(),
    ];
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

  it("createKnowledgeModuleItemV1 persists tags and multiple medias", () => {
    const item = createKnowledgeModuleItemV1({
      title: "テストPDF",
      summary: "概要テスト",
      genre: "IoT",
      tags: ["IoT", "施工方法"],
      pdf_url: "/uploads/knowledge/module/sample.pdf",
      medias: [
        { url: "/uploads/knowledge/module/sample.pdf", fileName: "sample.pdf" },
        { url: "/uploads/knowledge/module/field.jpg", fileName: "field.jpg" },
      ],
    });
    assert.equal(item.pdf_url, "/uploads/knowledge/module/sample.pdf");
    assert.equal(item.medias?.length, 2);
    assert.deepEqual(item.files, [
      "/uploads/knowledge/module/sample.pdf",
      "/uploads/knowledge/module/field.jpg",
    ]);
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
      /summary is required when no media is attached/
    );
  });

  it("normalizes arrays first and falls back to legacy single fields", () => {
    const medias = normalizeKnowledgeModuleMediasV1({
      medias: [{ url: "/new/one.jpg", fileName: "one.jpg" }],
      files: ["/new/two.pdf"],
      media: "/legacy/video.mp4",
      file: "/legacy/one.jpg",
      pdf_url: "/new/two.pdf",
    });
    assert.deepEqual(
      medias.map((entry) => entry.url),
      ["/new/one.jpg", "/new/two.pdf", "/legacy/video.mp4", "/legacy/one.jpg"]
    );
  });

  it("updateKnowledgeModuleItemV1 replaces attachments without changing identity", () => {
    const created = createKnowledgeModuleItemV1({
      title: "編集前",
      summary: "既存データ",
      genre: "IoT",
      medias: [{ url: "/uploads/knowledge/module/old.jpg" }],
    });
    const updated = updateKnowledgeModuleItemV1(created.id, {
      title: "編集後",
      summary: "既存データを保持して更新",
      genre: "IoT",
      tags: ["編集"],
      medias: [
        { url: "/uploads/knowledge/module/old.jpg" },
        { url: "/uploads/knowledge/module/new.pdf" },
      ],
      files: [],
      pdf_url: null,
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.medias?.length, 2);
  });

  it("saveKnowledgeModulePdfV1 rejects unsupported types", () => {
    assert.throws(
      () =>
        saveKnowledgeModulePdfV1({
          fileName: "note.txt",
          fileBase64: Buffer.from("hello").toString("base64"),
        }),
      /Unsupported file type/
    );
  });

  it("saveKnowledgeModulePdfV1 stores valid PDF", () => {
    const pdfBytes = Buffer.from("%PDF-1.4 test content!!");
    const result = saveKnowledgeModulePdfV1({
      fileName: "manual.pdf",
      fileBase64: pdfBytes.toString("base64"),
    });
    assert.match(result.pdf_url, /^\/uploads\/knowledge\/test-module-api-v1\/.*\.pdf$/);
    const diskPath = path.join(process.cwd(), result.pdf_url.replace(/^\//, ""));
    assert.ok(fs.existsSync(diskPath));
  });

  it("saveKnowledgeModulePdfV1 stores JPEG and MP4", () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const jpgResult = saveKnowledgeModulePdfV1({
      fileName: "shot.jpg",
      fileBase64: jpeg.toString("base64"),
    });
    assert.match(jpgResult.pdf_url, /\.jpg$/);

    // ISO BMFF: size + ftyp + brand
    const mp4 = Buffer.alloc(16, 0);
    mp4.writeUInt32BE(16, 0);
    mp4.write("ftyp", 4, "ascii");
    mp4.write("isom", 8, "ascii");
    const mp4Result = saveKnowledgeModulePdfV1({
      fileName: "clip.mp4",
      fileBase64: mp4.toString("base64"),
    });
    assert.match(mp4Result.pdf_url, /\.mp4$/);
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

  it("listKnowledgeModuleItemsV1 appends Eco-Water pH seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of ECO_WATER_PH_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const life = listed.find((x) => x.id === "kn-seed-ew-ph-life-001");
    assert.ok(life);
    assert.match(life!.title, /pHセンサーの耐久性/);
    assert.ok(life!.tags.includes("Eco-Water"));
    assert.ok(life!.tags.includes("水質"));
    assert.ok(life!.tags.includes("IOT関連"));
    assert.match(String(life!.body ?? ""), /3M KCl/);
    assert.match(String(life!.body ?? ""), /定期交換/);

    const maint = listed.find((x) => x.id === "kn-seed-ew-ph-maint-001");
    assert.ok(maint);
    assert.match(maint!.title, /クエン酸洗浄/);
    assert.ok(maint!.tags.includes("施工方法"));
    assert.ok(maint!.tags.includes("点検"));
    assert.match(String(maint!.body ?? ""), /点検モード/);
    assert.match(String(maint!.body ?? ""), /電磁弁/);
  });

  it("seedEcoWaterPhKnowledgeCardsV1 upserts searchable cards", () => {
    seedEcoWaterPhKnowledgeCardsV1();
    const life = getKnowledgeCardV1("EW-PH-LIFE-001");
    assert.ok(life);
    assert.match(life!.title, /耐久性と寿命基準/);
    assert.ok(life!.tags.includes("Eco-Water"));
    assert.equal(life!.category, "Eco-Water");
    assert.match(life!.summary, /先端電極/);

    const maint = getKnowledgeCardV1("EW-PH-CITRIC-001");
    assert.ok(maint);
    assert.match(maint!.title, /クエン酸洗浄/);
    assert.ok(maint!.tags.includes("点検"));
    assert.match(String(maint!.body ?? ""), /クエン酸/);
  });

  it("listKnowledgeModuleItemsV1 appends Eco-Water field seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of ECO_WATER_FIELD_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const rs485 = listed.find((x) => x.id === "kn-seed-ew-rs485-modbus-001");
    assert.ok(rs485);
    assert.match(rs485!.title, /RS485・Modbus/);
    assert.ok(rs485!.tags.includes("通信"));
    assert.ok(rs485!.tags.includes("RS485"));
    assert.ok(rs485!.tags.includes("IOT関連"));
    assert.ok(rs485!.tags.includes("電気工事"));
    assert.match(String(rs485!.body ?? ""), /終端抵抗/);
    assert.match(String(rs485!.body ?? ""), /120Ω/);

    const cal = listed.find((x) => x.id === "kn-seed-ew-ph-cal-001");
    assert.ok(cal);
    assert.match(cal!.title, /標準液校正/);
    assert.ok(cal!.tags.includes("施工方法"));
    assert.ok(cal!.tags.includes("点検"));
    assert.match(String(cal!.body ?? ""), /ゼロ点/);
    assert.match(String(cal!.body ?? ""), /スパン/);

    const install = listed.find((x) => x.id === "kn-seed-ew-sensor-install-001");
    assert.ok(install);
    assert.match(install!.title, /浸漬設置基準/);
    assert.ok(install!.tags.includes("現場"));
    assert.ok(install!.tags.includes("Eco-Water"));
    assert.match(String(install!.body ?? ""), /逆さ設置/);
    assert.match(String(install!.body ?? ""), /VP 管/);
  });

  it("seedEcoWaterFieldKnowledgeCardsV1 upserts searchable cards", () => {
    seedEcoWaterFieldKnowledgeCardsV1();
    const rs485 = getKnowledgeCardV1("EW-RS485-MODBUS-001");
    assert.ok(rs485);
    assert.match(rs485!.title, /RS485・Modbus/);
    assert.ok(rs485!.tags.includes("通信"));
    assert.equal(rs485!.category, "Eco-Water");
    assert.match(rs485!.summary, /極性逆接/);

    const cal = getKnowledgeCardV1("EW-PH-CAL-001");
    assert.ok(cal);
    assert.match(cal!.title, /標準液校正/);
    assert.ok(cal!.tags.includes("点検"));
    assert.match(String(cal!.body ?? ""), /pH6.86/);

    const install = getKnowledgeCardV1("EW-SENSOR-INSTALL-001");
    assert.ok(install);
    assert.match(install!.title, /浸漬設置基準/);
    assert.ok(install!.tags.includes("現場"));
    assert.match(String(install!.body ?? ""), /45 度/);
  });

  it("listKnowledgeModuleItemsV1 appends security floor seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of SECURITY_FLOOR_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const mmwave = listed.find(
      (x) => x.id === "kn-seed-sec-floor-mmwave-001"
    );
    assert.ok(mmwave);
    assert.match(mmwave!.title, /HLK-LD2410B/);
    assert.match(String(mmwave!.summary ?? ""), /フロアマップ/);
  });

  it("seedSecurityFloorKnowledgeCardsV1 upserts searchable cards", () => {
    seedSecurityFloorKnowledgeCardsV1();
    const mmwave = getKnowledgeCardV1("SEC-FLOOR-MMWAVE-001");
    assert.ok(mmwave);
    assert.match(mmwave!.title, /ミリ波レーダー/);
    const yellow = getKnowledgeCardV1("SEC-FLOOD-YELLOW-001");
    assert.ok(yellow);
    assert.match(yellow!.title, /クリアイエロー/);
    const gas = getKnowledgeCardV1("SEC-GAS-PULSE-001");
    assert.ok(gas);
    assert.match(gas!.title, /DT\/SG/);
    const sim = getKnowledgeCardV1("SEC-SIM-WATCH-001");
    assert.ok(sim);
    assert.match(sim!.title, /格安SIM/);
  });

  it("listKnowledgeModuleItemsV1 appends ops insight seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of OPS_INSIGHT_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const delay = listed.find(
      (x) => x.id === "kn-seed-sensor-delay-design-001"
    );
    assert.ok(delay);
    assert.match(delay!.title, /ソフトウェアディレイ/);
    assert.ok(delay!.tags.includes("#Sensor"));
    assert.ok(delay!.tags.includes("#RP2350"));
    assert.match(String(delay!.summary ?? ""), /時定数/);
    assert.match(String(delay!.body ?? ""), /移動平均/);

    const debounce = listed.find(
      (x) => x.id === "kn-seed-radar-debounce-100ms-001"
    );
    assert.ok(debounce);
    assert.match(debounce!.title, /デバウンス黄金比/);
    assert.ok(debounce!.tags.includes("#LD2410"));
    assert.match(String(debounce!.body ?? ""), /100ms〜150ms/);

    const iso = listed.find(
      (x) => x.id === "kn-seed-ui-isometric-3d-001"
    );
    assert.ok(iso);
    assert.match(iso!.title, /アイソメトリック/);
    assert.ok(iso!.tags.includes("#ThreeJS"));
    assert.match(String(iso!.body ?? ""), /OrbitControls/);

    const hb = listed.find(
      (x) => x.id === "kn-seed-rp2350-heartbeat-sched-001"
    );
    assert.ok(hb);
    assert.match(hb!.title, /ハートビート/);
    assert.ok(hb!.tags.includes("#Heartbeat"));
    assert.match(String(hb!.body ?? ""), /日跨ぎ/);

    const brand = listed.find(
      (x) => x.id === "kn-seed-brand-shield-emblem-001"
    );
    assert.ok(brand);
    assert.match(brand!.title, /シールドエンブレム/);
    assert.ok(brand!.tags.includes("#TiSLY"));
    assert.match(String(brand!.body ?? ""), /32〜40px/);
  });

  it("seedOpsInsightKnowledgeCardsV1 upserts searchable cards", () => {
    seedOpsInsightKnowledgeCardsV1();
    const delay = getKnowledgeCardV1("OPS-SENSOR-DELAY-001");
    assert.ok(delay);
    assert.match(delay!.title, /応答速度/);
    const debounce = getKnowledgeCardV1("OPS-RADAR-DEBOUNCE-001");
    assert.ok(debounce);
    assert.match(debounce!.title, /草木誤検知/);
    const iso = getKnowledgeCardV1("OPS-UI-ISOMETRIC-3D-001");
    assert.ok(iso);
    assert.match(iso!.title, /お掃除ロボット風/);
    const hb = getKnowledgeCardV1("OPS-RP2350-HEARTBEAT-001");
    assert.ok(hb);
    assert.match(hb!.title, /タイムスケジュール/);
    const brand = getKnowledgeCardV1("OPS-BRAND-SHIELD-001");
    assert.ok(brand);
    assert.match(brand!.title, /立体シールド/);
  });

  it("listKnowledgeModuleItemsV1 appends security stream seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of SECURITY_STREAM_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const webrtc = listed.find(
      (x) => x.id === "kn-seed-cam-webrtc-hybrid-001"
    );
    assert.ok(webrtc);
    assert.match(webrtc!.title, /WebRTC/);
    assert.ok(webrtc!.tags.includes("#Streaming"));
    assert.match(String(webrtc!.body ?? ""), /ハイブリッド/);

    const nvr = listed.find((x) => x.id === "kn-seed-nvr-hview-rtsp-001");
    assert.ok(nvr);
    assert.match(nvr!.title, /H\.View/);
    assert.ok(nvr!.tags.includes("#RTSP"));
    assert.match(String(nvr!.summary ?? ""), /unicast\/c1\/s1\/live/);

    const poe = listed.find((x) => x.id === "kn-seed-poe-200v-hub-001");
    assert.ok(poe);
    assert.match(poe!.title, /PoEハブ/);
    assert.ok(poe!.tags.includes("#200V"));
    assert.match(String(poe!.body ?? ""), /TL-SG1005P/);

    const care = listed.find(
      (x) => x.id === "kn-seed-radar-care-privacy-001"
    );
    assert.ok(care);
    assert.match(care!.title, /プライバシー保護/);
    assert.ok(care!.tags.includes("#Care"));
    assert.match(String(care!.body ?? ""), /LD2450/);

    const gas = listed.find((x) => x.id === "kn-seed-gas-pulse-subsc-001");
    assert.ok(gas);
    assert.match(gas!.title, /自動検針/);
    assert.ok(gas!.tags.includes("#Subsc"));
    assert.match(String(gas!.body ?? ""), /格安 SIM/);
  });

  it("seedSecurityStreamKnowledgeCardsV1 upserts searchable cards", () => {
    seedSecurityStreamKnowledgeCardsV1();
    const webrtc = getKnowledgeCardV1("CAM-WEBRTC-HYBRID-001");
    assert.ok(webrtc);
    assert.match(webrtc!.title, /ストリーミング比較/);
    const nvr = getKnowledgeCardV1("NVR-HVIEW-RTSP-001");
    assert.ok(nvr);
    assert.match(nvr!.title, /サブストリーム統合/);
    const poe = getKnowledgeCardV1("POE-200V-HUB-001");
    assert.ok(poe);
    assert.match(poe!.title, /単相200V/);
    const care = getKnowledgeCardV1("RADAR-CARE-PRIVACY-001");
    assert.ok(care);
    assert.match(care!.title, /安否確認/);
    const gas = getKnowledgeCardV1("GAS-PULSE-SUBSC-001");
    assert.ok(gas);
    assert.match(gas!.title, /24時間見守り/);
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

  after(() => {
    cleanupModuleData();
    fs.rmSync(path.dirname(moduleItemsPath), { recursive: true, force: true });
    fs.rmSync(getKnowledgeModulePdfUploadDir(), { recursive: true, force: true });
  });

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

  it("POST and PATCH preserve multiple attachments", async () => {
    const create = await request(app)
      .post("/api/knowledge/module-v1/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "複数添付",
        summary: "",
        genre: "制御",
        tags: ["複数"],
        medias: [
          { url: "/uploads/knowledge/module/a.jpg", fileName: "a.jpg" },
          { url: "/uploads/knowledge/module/b.pdf", fileName: "b.pdf" },
        ],
      });
    assert.equal(create.status, 201);
    assert.equal(create.body.item.medias.length, 2);
    assert.equal(create.body.item.pdf_url, "/uploads/knowledge/module/a.jpg");

    const update = await request(app)
      .patch(`/api/knowledge/module-v1/items/${create.body.item.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "複数添付・編集済み",
        summary: "",
        genre: "制御",
        tags: ["複数", "編集"],
        medias: [{ url: "/uploads/knowledge/module/b.pdf", fileName: "b.pdf" }],
      });
    assert.equal(update.status, 200);
    assert.equal(update.body.item.medias.length, 1);
    assert.equal(update.body.item.pdf_url, "/uploads/knowledge/module/b.pdf");
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
    assert.match(upload.body.pdf_url, /\/uploads\/knowledge\/test-module-api-v1\//);

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
    const pdfBytes = Buffer.from("%PDF-1.4 static serve!!");
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

  it("POST /module-v1/upload-pdf accepts JPEG image", async () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const upload = await request(app)
      .post("/api/knowledge/module-v1/upload-pdf")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fileName: "field.jpg",
        fileBase64: jpeg.toString("base64"),
      });
    assert.equal(upload.status, 201);
    assert.match(upload.body.pdf_url, /\.jpg$/);
  });
});

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
const {
  VOICE_CALL_MODULE_SEED_IDS,
  seedVoiceCallKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-voice-call-seed-v1.js");
const {
  FACTORY_STL_MODULE_SEED_IDS,
  seedFactoryStlKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-factory-stl-seed-v1.js");
const {
  REVOPOINT_SCAN_MODULE_SEED_IDS,
  seedRevopointScanKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-revopoint-scan-seed-v1.js");
const {
  HYBRID_3D_STORE_MODULE_SEED_IDS,
  seedHybrid3dStoreKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-hybrid-3d-store-seed-v1.js");
const {
  PARAMETRIC_3D_MODULE_SEED_IDS,
  seedParametric3dKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-parametric-3d-seed-v1.js");
const {
  FACTORY_DX_PART1_MODULE_SEED_IDS,
  seedFactoryDxPart1KnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-factory-dx-part1-seed-v1.js");
const {
  FACTORY_DX_PART2_MODULE_SEED_IDS,
  seedFactoryDxPart2KnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-factory-dx-part2-seed-v1.js");
const {
  IR_BEAM_MOUNT_MODULE_SEED_IDS,
  seedIrBeamMountKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-ir-beam-mount-seed-v1.js");
const {
  RJ45_BEAM_HOUSING_MODULE_SEED_IDS,
  seedRj45BeamHousingKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-rj45-beam-housing-seed-v1.js");
const {
  SMART_INTERCOM_MODULE_SEED_IDS,
  seedSmartIntercomKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-smart-intercom-seed-v1.js");
const {
  HOME_INTERCOM_MODULE_SEED_IDS,
  seedHomeIntercomKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-home-intercom-seed-v1.js");
const {
  TEXT_TO_3D_MODULE_SEED_IDS,
  seedTextTo3dKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-text-to-3d-seed-v1.js");
const {
  MULTI_ANGLE_SKETCH_MODULE_SEED_IDS,
  seedMultiAngleSketchKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-multi-angle-sketch-seed-v1.js");
const {
  RP2350_COVER_MODULE_SEED_IDS,
  seedRp2350CoverKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-rp2350-cover-seed-v1.js");
const {
  FIELD_DX_3D_MODULE_SEED_IDS,
  seedFieldDx3dKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-field-dx-3d-seed-v1.js");
const {
  TOP_DOWN_ORIENT_MODULE_SEED_IDS,
  seedTopDownOrientKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-top-down-orient-seed-v1.js");
const {
  PART_OFFSET_ORIENT_MODULE_SEED_IDS,
  seedPartOffsetOrientKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-part-offset-orient-seed-v1.js");
const {
  PWA_WEB_PUSH_MODULE_SEED_IDS,
  seedPwaWebPushKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-pwa-push-seed-v1.js");
const {
  DOORPHONE_TD_B30C_MODULE_SEED_IDS,
  seedDoorphoneTdB30cKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-doorphone-td-b30c-seed-v1.js");
const {
  ATTENDANCE_NFC_MODULE_SEED_IDS,
  seedAttendanceNfcKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-attendance-nfc-seed-v1.js");
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

  it("listKnowledgeModuleItemsV1 appends voice call seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of VOICE_CALL_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const voice = listed.find(
      (x) => x.id === "kn-seed-voice-call-calendar-dx-001"
    );
    assert.ok(voice);
    assert.match(voice!.title, /Googleカレンダー自動同期/);
    assert.ok(voice!.tags.includes("#VoiceAI"));
    assert.ok(voice!.tags.includes("#Gemini"));
    assert.match(String(voice!.body ?? ""), /Web Speech API/);
  });

  it("seedVoiceCallKnowledgeCardsV1 upserts searchable cards", () => {
    seedVoiceCallKnowledgeCardsV1();
    const voice = getKnowledgeCardV1("VOICE-CALL-CALENDAR-DX-001");
    assert.ok(voice);
    assert.match(voice!.title, /材料自動抽出/);
    assert.ok(voice!.tags.includes("#FieldDX"));
  });

  it("listKnowledgeModuleItemsV1 appends factory STL seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of FACTORY_STL_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const factory = listed.find(
      (x) => x.id === "kn-seed-factory-stl-gemini-001"
    );
    assert.ok(factory);
    assert.match(factory!.title, /即時STL生成/);
    assert.ok(factory!.tags.includes("#3Dプリンター"));
    assert.ok(factory!.tags.includes("#GeminiAPI"));
    assert.ok(factory!.tags.includes("#TiSLY_Factory"));
    assert.match(String(factory!.body ?? ""), /Three\.js/);
  });

  it("seedFactoryStlKnowledgeCardsV1 upserts searchable cards", () => {
    seedFactoryStlKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-STL-GEMINI-001");
    assert.ok(card);
    assert.match(card!.title, /方眼紙スケッチ/);
    assert.ok(card!.tags.includes("#AI_Vision"));
    assert.ok(card!.tags.includes("#手書き図面DX"));
  });

  it("listKnowledgeModuleItemsV1 appends revopoint scan seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of REVOPOINT_SCAN_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-revopoint-mini2-scan-001"
    );
    assert.ok(item);
    assert.match(item!.title, /Revopoint MINI 2/);
    assert.ok(item!.tags.includes("#Revopoint"));
    assert.ok(item!.tags.includes("#3Dスキャナー"));
    assert.ok(item!.tags.includes("#リバースエンジニアリング"));
    assert.match(String(item!.body ?? ""), /Three\.js/);
  });

  it("seedRevopointScanKnowledgeCardsV1 upserts searchable cards", () => {
    seedRevopointScanKnowledgeCardsV1();
    const card = getKnowledgeCardV1("REVOPOINT-MINI2-SCAN-001");
    assert.ok(card);
    assert.match(card!.title, /リバースエンジニアリング/);
    assert.ok(card!.tags.includes("#ThreeJS"));
    assert.ok(card!.tags.includes("#現場DX"));
  });

  it("listKnowledgeModuleItemsV1 appends hybrid 3D store seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of HYBRID_3D_STORE_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-3d-hybrid-store-001"
    );
    assert.ok(item);
    assert.match(item!.title, /ハイブリッド保存設計/);
    assert.ok(item!.tags.includes("#QNAP"));
    assert.ok(item!.tags.includes("#IndexedDB"));
    assert.ok(item!.tags.includes("#データ保存"));
    assert.match(String(item!.body ?? ""), /3 層保存/);
  });

  it("seedHybrid3dStoreKnowledgeCardsV1 upserts searchable cards", () => {
    seedHybrid3dStoreKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-3D-HYBRID-STORE-001");
    assert.ok(card);
    assert.match(card!.title, /QNAP\/IndexedDB/);
    assert.ok(card!.tags.includes("#ThreeJS"));
    assert.ok(card!.tags.includes("#TiSLY_Factory"));
  });

  it("listKnowledgeModuleItemsV1 appends parametric 3D seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of PARAMETRIC_3D_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const delta = listed.find(
      (x) => x.id === "kn-seed-3d-param-delta-001"
    );
    assert.ok(delta);
    assert.match(delta!.title, /パラメトリック差分更新/);
    assert.ok(delta!.tags.includes("#パラメトリック設計"));
    assert.ok(delta!.tags.includes("#寸法調整"));
    assert.match(String(delta!.body ?? ""), /赤ペン再撮影/);
    const numbering = listed.find(
      (x) => x.id === "kn-seed-3d-param-number-001"
    );
    assert.ok(numbering);
    assert.match(numbering!.title, /ナンバリング/);
    assert.ok(numbering!.tags.includes("#UI設計"));
    assert.ok(numbering!.tags.includes("#ナンバリング"));
    assert.match(String(numbering!.body ?? ""), /丸数字/);
  });

  it("seedParametric3dKnowledgeCardsV1 upserts searchable cards", () => {
    seedParametric3dKnowledgeCardsV1();
    const delta = getKnowledgeCardV1("FACTORY-3D-PARAM-DELTA-001");
    assert.ok(delta);
    assert.match(delta!.title, /リアルタイム寸法微調整/);
    assert.ok(delta!.tags.includes("#現場DX"));
    const numbering = getKnowledgeCardV1("FACTORY-3D-PARAM-NUMBER-001");
    assert.ok(numbering);
    assert.match(numbering!.title, /インデックス連動UI/);
    assert.ok(numbering!.tags.includes("#ナンバリング"));
  });

  it("listKnowledgeModuleItemsV1 appends factory DX part1 seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of FACTORY_DX_PART1_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const viewer = listed.find(
      (x) => x.id === "kn-seed-revopoint-hybrid-viewer-001"
    );
    assert.ok(viewer);
    assert.match(viewer!.title, /ハイブリッド保存/);
    assert.ok(viewer!.tags.includes("#Revopoint"));
    assert.ok(viewer!.tags.includes("#QNAP"));
    const deltaUi = listed.find(
      (x) => x.id === "kn-seed-3d-param-number-delta-ui-001"
    );
    assert.ok(deltaUi);
    assert.match(deltaUi!.title, /リアルタイム差分更新UI/);
    assert.ok(deltaUi!.tags.includes("#ナンバリング"));
    const qrAr = listed.find((x) => x.id === "kn-seed-qr-ar-reprint-001");
    assert.ok(qrAr);
    assert.match(qrAr!.title, /AR原寸重ね合わせ/);
    assert.ok(qrAr!.tags.includes("#QR連動"));
    assert.ok(qrAr!.tags.includes("#AR干渉チェック"));
  });

  it("seedFactoryDxPart1KnowledgeCardsV1 upserts searchable cards", () => {
    seedFactoryDxPart1KnowledgeCardsV1();
    const viewer = getKnowledgeCardV1("FACTORY-REVOPOINT-HYBRID-VIEWER-001");
    assert.ok(viewer);
    assert.match(viewer!.title, /3Dビューアー/);
    const deltaUi = getKnowledgeCardV1("FACTORY-3D-PARAM-NUMBER-DELTA-UI-001");
    assert.ok(deltaUi);
    assert.ok(deltaUi!.tags.includes("#寸法調整"));
    const qrAr = getKnowledgeCardV1("FACTORY-QR-AR-REPRINT-001");
    assert.ok(qrAr);
    assert.match(qrAr!.title, /QRコード直結/);
    assert.ok(qrAr!.tags.includes("#保守DX"));
  });

  it("listKnowledgeModuleItemsV1 appends factory DX part2 seed cards", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of FACTORY_DX_PART2_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const asm = listed.find(
      (x) => x.id === "kn-seed-hybrid-sla-fdm-asm-001"
    );
    assert.ok(asm);
    assert.match(asm!.title, /結合アセンブリ/);
    assert.ok(asm!.tags.includes("#光造形"));
    assert.ok(asm!.tags.includes("#ELEGOO"));
    const push = listed.find(
      (x) => x.id === "kn-seed-printer-push-strength-001"
    );
    assert.ok(push);
    assert.match(push!.title, /積層強度AIガイド/);
    assert.ok(push!.tags.includes("#PWA通知"));
    const insert = listed.find(
      (x) => x.id === "kn-seed-insert-nut-cost-resin-001"
    );
    assert.ok(insert);
    assert.match(insert!.title, /インサートナット/);
    assert.ok(insert!.tags.includes("#耐候性樹脂"));
    const tywrap = listed.find(
      (x) => x.id === "kn-seed-tywrap-terminal-mold-001"
    );
    assert.ok(tywrap);
    assert.match(tywrap!.title, /端子モールド/);
    assert.ok(tywrap!.tags.includes("#結束バンド"));
  });

  it("seedFactoryDxPart2KnowledgeCardsV1 upserts searchable cards", () => {
    seedFactoryDxPart2KnowledgeCardsV1();
    const asm = getKnowledgeCardV1("FACTORY-HYBRID-SLA-FDM-ASM-001");
    assert.ok(asm);
    assert.ok(asm!.tags.includes("#Creality"));
    const push = getKnowledgeCardV1("FACTORY-PRINTER-PUSH-STRENGTH-001");
    assert.ok(push);
    assert.match(push!.title, /PWAプッシュ通知/);
    const insert = getKnowledgeCardV1("FACTORY-INSERT-NUT-COST-RESIN-001");
    assert.ok(insert);
    assert.ok(insert!.tags.includes("#原価計算"));
    const tywrap = getKnowledgeCardV1("FACTORY-TYWRAP-TERMINAL-MOLD-001");
    assert.ok(tywrap);
    assert.ok(tywrap!.tags.includes("#立体モールド"));
  });

  it("listKnowledgeModuleItemsV1 appends IR beam mount seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of IR_BEAM_MOUNT_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-ir-beam-mount-visor-001"
    );
    assert.ok(item);
    assert.match(item!.title, /単管マウント架台/);
    assert.ok(item!.tags.includes("#赤外線ビーム"));
    assert.ok(item!.tags.includes("#誤報防止"));
    assert.ok(item!.tags.includes("#TiSLY_Security"));
    assert.match(String(item!.body ?? ""), /ロングサンバイザー/);
  });

  it("seedIrBeamMountKnowledgeCardsV1 upserts searchable cards", () => {
    seedIrBeamMountKnowledgeCardsV1();
    const card = getKnowledgeCardV1("SEC-IR-BEAM-MOUNT-VISOR-001");
    assert.ok(card);
    assert.match(card!.title, /誤報防止バイザー/);
    assert.ok(card!.tags.includes("#単管マウント"));
    assert.ok(card!.tags.includes("#3Dプリンター"));
  });

  it("listKnowledgeModuleItemsV1 appends RJ45 beam housing seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of RJ45_BEAM_HOUSING_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-rj45-beam-housing-001"
    );
    assert.ok(item);
    assert.match(item!.title, /RJ45ビームセンサーハウジング/);
    assert.ok(item!.tags.includes("#自社ブランド化"));
    assert.ok(item!.tags.includes("#壁面取付"));
    assert.ok(item!.tags.includes("#RJ45"));
    assert.ok(item!.tags.includes("#TiSLY_Security"));
    assert.match(String(item!.body ?? ""), /万能ベースプレート/);
  });

  it("seedRj45BeamHousingKnowledgeCardsV1 upserts searchable cards", () => {
    seedRj45BeamHousingKnowledgeCardsV1();
    const card = getKnowledgeCardV1("SEC-RJ45-BEAM-HOUSING-001");
    assert.ok(card);
    assert.match(card!.title, /ポール＆壁面両対応/);
    assert.ok(card!.tags.includes("#ビームセンサー"));
    assert.ok(card!.tags.includes("#単管マウント"));
  });

  it("listKnowledgeModuleItemsV1 appends smart intercom seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of SMART_INTERCOM_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-smart-intercom-td-sm5030-001"
    );
    assert.ok(item);
    assert.match(item!.title, /TD-SM5030CT-BSH/);
    assert.ok(item!.tags.includes("#スマートドアホン"));
    assert.ok(item!.tags.includes("#電気錠解錠"));
    assert.ok(item!.tags.includes("#RP2350"));
    assert.match(String(item!.body ?? ""), /HomeLink/);
  });

  it("seedSmartIntercomKnowledgeCardsV1 upserts searchable cards", () => {
    seedSmartIntercomKnowledgeCardsV1();
    const card = getKnowledgeCardV1("SEC-SMART-INTERCOM-TD-SM5030-001");
    assert.ok(card);
    assert.match(card!.title, /電気錠遠隔解錠/);
    assert.ok(card!.tags.includes("#PWA来客応答"));
    assert.ok(card!.tags.includes("#リレー連動"));
  });

  it("listKnowledgeModuleItemsV1 appends HOME intercom seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of HOME_INTERCOM_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-home-intercom-td-sm5030-001"
    );
    assert.ok(item);
    assert.match(item!.title, /TiSLY HOME統合仕様/);
    assert.ok(item!.tags.includes("#TiSLY_HOME"));
    assert.ok(item!.tags.includes("#インターホン連携"));
    assert.ok(item!.tags.includes("#TD-SM5030CT-BSH"));
    assert.match(String(item!.body ?? ""), /HomeLink/);
  });

  it("seedHomeIntercomKnowledgeCardsV1 upserts searchable cards", () => {
    seedHomeIntercomKnowledgeCardsV1();
    const card = getKnowledgeCardV1("HOME-INTERCOM-TD-SM5030-001");
    assert.ok(card);
    assert.match(card!.title, /スマートホーム施工/);
    assert.ok(card!.tags.includes("#電気錠解錠"));
    assert.ok(card!.tags.includes("#RP2350"));
  });

  it("listKnowledgeModuleItemsV1 appends Text-to-3D seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of TEXT_TO_3D_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-factory-text-to-3d-001"
    );
    assert.ok(item);
    assert.match(item!.title, /自然言語・音声プロンプト/);
    assert.ok(item!.tags.includes("#TextTo3D"));
    assert.ok(item!.tags.includes("#音声入力"));
    assert.ok(item!.tags.includes("#TiSLY_Factory"));
    assert.match(String(item!.body ?? ""), /Web Speech API/);
  });

  it("seedTextTo3dKnowledgeCardsV1 upserts searchable cards", () => {
    seedTextTo3dKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-TEXT-TO-3D-001");
    assert.ok(card);
    assert.match(card!.title, /STLオンデマンド生成/);
    assert.ok(card!.tags.includes("#3Dプリンター"));
    assert.ok(card!.tags.includes("#PWA"));
  });

  it("listKnowledgeModuleItemsV1 appends multi-angle sketch seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of MULTI_ANGLE_SKETCH_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-factory-multi-angle-sketch-001"
    );
    assert.ok(item);
    assert.match(item!.title, /マルチアングル方眼紙/);
    assert.ok(item!.tags.includes("#GeminiVision"));
    assert.ok(item!.tags.includes("#三面図認識"));
    assert.ok(item!.tags.includes("#マルチアングル"));
    assert.match(String(item!.body ?? ""), /最大4枚/);
  });

  it("seedMultiAngleSketchKnowledgeCardsV1 upserts searchable cards", () => {
    seedMultiAngleSketchKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-MULTI-ANGLE-SKETCH-001");
    assert.ok(card);
    assert.match(card!.title, /高精度3D寸法抽出/);
    assert.ok(card!.tags.includes("#現場DX"));
    assert.ok(card!.tags.includes("#PWA"));
  });

  it("listKnowledgeModuleItemsV1 appends RP2350 cover scan seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of RP2350_COVER_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-rp2350-poe-cover-scan-001"
    );
    assert.ok(item);
    assert.match(item!.title, /RP2350-POE実測寸法/);
    assert.ok(item!.tags.includes("#RP2350"));
    assert.ok(item!.tags.includes("#Revopoint"));
    assert.ok(item!.tags.includes("#実測モデリング"));
    assert.match(String(item!.summary ?? ""), /154\.2/);
    assert.match(String(item!.body ?? ""), /クリアランス/);
  });

  it("seedRp2350CoverKnowledgeCardsV1 upserts searchable cards", () => {
    seedRp2350CoverKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-RP2350-POE-COVER-SCAN-001");
    assert.ok(card);
    assert.match(card!.title, /スキャン結合モデリング/);
    assert.ok(card!.tags.includes("#3Dプリンター"));
    assert.ok(card!.tags.includes("#TiSLY_Factory"));
  });

  it("listKnowledgeModuleItemsV1 appends field DX 3D unified seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of FIELD_DX_3D_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-field-dx-3d-unified-001"
    );
    assert.ok(item);
    assert.match(item!.title, /電工パーツ自動抜き穴/);
    assert.ok(item!.tags.includes("#電工DX"));
    assert.ok(item!.tags.includes("#DINレール"));
    assert.ok(item!.tags.includes("#分解図"));
    assert.match(String(item!.summary ?? ""), /爆発図/);
  });

  it("seedFieldDx3dKnowledgeCardsV1 upserts searchable cards", () => {
    seedFieldDx3dKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-FIELD-DX-3D-UNIFIED-001");
    assert.ok(card);
    assert.match(card!.title, /コスト試算・分解図統合/);
    assert.ok(card!.tags.includes("#原価計算"));
    assert.ok(card!.tags.includes("#PWA"));
  });

  it("listKnowledgeModuleItemsV1 appends top-down orient seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of TOP_DOWN_ORIENT_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-top-down-orient-stl-001"
    );
    assert.ok(item);
    assert.match(item!.title, /天面接地オートオリエンテーション/);
    assert.ok(item!.tags.includes("#サポートレス"));
    assert.ok(item!.tags.includes("#STL最適化"));
    assert.match(String(item!.summary ?? ""), /Z=0/);
  });

  it("seedTopDownOrientKnowledgeCardsV1 upserts searchable cards", () => {
    seedTopDownOrientKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-TOP-DOWN-ORIENT-STL-001");
    assert.ok(card);
    assert.match(card!.title, /サポートレスSTL/);
    assert.ok(card!.tags.includes("#造形強度"));
    assert.ok(card!.tags.includes("#TiSLY_Factory"));
  });

  it("listKnowledgeModuleItemsV1 appends part-offset orient seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of PART_OFFSET_ORIENT_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-part-offset-orient-001"
    );
    assert.ok(item);
    assert.match(item!.title, /パーツ個別オフセット調整/);
    assert.ok(item!.tags.includes("#位置調整"));
    assert.ok(item!.tags.includes("#パラメトリック設計"));
    assert.match(String(item!.summary ?? ""), /ミリ単位/);
  });

  it("seedPartOffsetOrientKnowledgeCardsV1 upserts searchable cards", () => {
    seedPartOffsetOrientKnowledgeCardsV1();
    const card = getKnowledgeCardV1("FACTORY-PART-OFFSET-TOPDOWN-001");
    assert.ok(card);
    assert.match(card!.title, /天面接地サポートレスSTL/);
    assert.ok(card!.tags.includes("#サポートレス"));
    assert.ok(card!.tags.includes("#TiSLY_Factory"));
  });

  it("listKnowledgeModuleItemsV1 appends pwa web push seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of PWA_WEB_PUSH_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-pwa-web-push-register-001"
    );
    assert.ok(item);
    assert.match(item!.title, /Web Push通知登録ボタン/);
    assert.ok(item!.tags.includes("#WebPush"));
    assert.ok(item!.tags.includes("#TiSLY_HOME"));
  });

  it("seedPwaWebPushKnowledgeCardsV1 upserts searchable cards", () => {
    seedPwaWebPushKnowledgeCardsV1();
    const card = getKnowledgeCardV1("PWA-WEB-PUSH-REGISTER-001");
    assert.ok(card);
    assert.match(card!.title, /Service Worker購読フロー/);
    assert.ok(card!.tags.includes("#PWA"));
    assert.ok(card!.tags.includes("#通知登録"));
  });

  it("listKnowledgeModuleItemsV1 appends doorphone TD-B30C seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of DOORPHONE_TD_B30C_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-doorphone-td-b30c-pwa-001"
    );
    assert.ok(item);
    assert.match(item!.title, /TD-B30C/);
    assert.ok(item!.tags.includes("#Doorphone"));
    assert.ok(item!.tags.includes("#TiSLY_HOME"));
  });

  it("seedDoorphoneTdB30cKnowledgeCardsV1 upserts searchable cards", () => {
    seedDoorphoneTdB30cKnowledgeCardsV1();
    const card = getKnowledgeCardV1("HOME-DOORPHONE-TD-B30C-001");
    assert.ok(card);
    assert.match(card!.title, /電気錠連動ハック/);
    assert.ok(card!.tags.includes("#TD_B30C"));
    assert.ok(card!.tags.includes("#SmartLock"));
  });

  it("listKnowledgeModuleItemsV1 appends attendance NFC RS485 seed card", () => {
    cleanupModuleData();
    const listed = listKnowledgeModuleItemsV1();
    for (const id of ATTENDANCE_NFC_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    const item = listed.find(
      (x) => x.id === "kn-seed-attendance-nfc-rs485-001"
    );
    assert.ok(item);
    assert.match(item!.title, /勤怠打刻/);
    assert.ok(item!.tags.includes("#勤怠管理"));
    assert.ok(item!.tags.includes("#TiSLY_Core"));
  });

  it("seedAttendanceNfcKnowledgeCardsV1 upserts searchable cards", () => {
    seedAttendanceNfcKnowledgeCardsV1();
    const card = getKnowledgeCardV1("OPS-ATTENDANCE-NFC-001");
    assert.ok(card);
    assert.match(card!.title, /電気錠連動仕様/);
    assert.ok(card!.tags.includes("#RS485"));
    assert.ok(card!.tags.includes("#NFCリーダー"));
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

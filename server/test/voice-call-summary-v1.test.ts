import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

process.env.JWT_SECRET = "test-jwt-voice-call-summary-v1";
process.env.CUSTOMER_DEMO_PASSWORD = "demo-remote-2026";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-voice-call-summary-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";
process.env.VOICE_CALL_DATA_DIR = "./data/test-voice-call-summary-v1";
process.env.GOOGLE_CALENDAR_ENABLED = "false";
delete process.env.GEMINI_API_KEY;

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/database.js");
const {
  extractVoiceCallRuleBasedV1,
} = await import("../src/voice-call/voice-call-extract-v1.js");
const {
  commitVoiceCallSummaryV1,
} = await import("../src/voice-call/voice-call-commit-v1.js");
const {
  VOICE_CALL_MODULE_SEED_IDS,
  seedVoiceCallKnowledgeCardsV1,
} = await import("../src/knowledge/knowledge-voice-call-seed-v1.js");
const {
  listKnowledgeModuleItemsV1,
} = await import("../src/knowledge/knowledge-module-v1.js");
const { getKnowledgeCardV1 } = await import("../src/knowledge/knowledge-store-v1.js");

const app = createApp();

function cleanupVoiceData() {
  const dir = path.resolve("./data/test-voice-call-summary-v1");
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("voice-call-summary-v1", () => {
  let token = "";

  before(async () => {
    cleanupVoiceData();
    const login = await request(app).post("/api/auth/customer/login").send({
      customerCode: "TOMS001",
      username: "toms001.surveyor",
      password: "demo-remote-2026",
    });
    assert.equal(login.status, 200, "surveyor login");
    token = login.body.token;
  });

  after(async () => {
    cleanupVoiceData();
    await closeDatabase();
  });

  it("GET /voice-hub-v1 returns HTML shell", async () => {
    const res = await request(app).get("/voice-hub-v1");
    assert.equal(res.status, 200);
    assert.match(res.text, /通話音声・クイック入力/);
    assert.match(res.text, /voice-hub-v1\.js/);
    assert.match(res.text, /カレンダー＆案件メモに確定登録/);
  });

  it("rule-based extract finds schedule and materials", () => {
    const extraction = extractVoiceCallRuleBasedV1(
      "明日10時に板橋の現場で現調。センサー 3個 を発注。お客様は玄関カメラを希望。決定でOK。"
    );
    assert.equal(extraction.provider, "rule_based");
    assert.ok(extraction.schedule);
    assert.match(extraction.schedule!.title, /現調|フォロー/);
    assert.ok(extraction.materials.length >= 1);
    assert.ok(extraction.memo.summary3Lines.some((l) => l.length > 0));
  });

  it("commit registers calendar mock and materials", async () => {
    const extraction = extractVoiceCallRuleBasedV1(
      "明日の現調。ケーブル 50m とセンサー 2個を発注。"
    );
    const result = await commitVoiceCallSummaryV1({
      extraction,
      countryCode: "JP",
      currency: "JPY",
    });
    assert.equal(result.ok, true);
    assert.ok(result.commitId.startsWith("VC-"));
    assert.equal(result.calendar.mode, "mock");
    assert.ok(result.calendar.eventId);
    assert.ok(result.materials.added >= 1);
    assert.equal(result.memo.saved, true);
  });

  it("API extract + commit with auth", async () => {
    if (!token) {
      assert.ok(true, "skip without auth token");
      return;
    }
    const extractRes = await request(app)
      .post("/api/voice-call/v1/extract")
      .set("Authorization", `Bearer ${token}`)
      .send({
        transcript:
          "明後日に見積訪問。VVFケーブル 30m を手配。了承済み。",
        locale: "JP",
        currency: "JPY",
      });
    assert.equal(extractRes.status, 200);
    assert.ok(extractRes.body.extraction);

    const commitRes = await request(app)
      .post("/api/voice-call/v1/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        extraction: extractRes.body.extraction,
        countryCode: "JP",
        currency: "JPY",
      });
    assert.equal(commitRes.status, 200);
    assert.equal(commitRes.body.ok, true);
  });

  it("knowledge seed appends voice call card", () => {
    process.env.KNOWLEDGE_MODULE_DATA_DIR =
      "./data/test-voice-call-knowledge-module";
    const dir = path.resolve("./data/test-voice-call-knowledge-module");
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    const listed = listKnowledgeModuleItemsV1();
    for (const id of VOICE_CALL_MODULE_SEED_IDS) {
      assert.ok(
        listed.some((x) => x.id === id),
        `missing seed ${id}`
      );
    }
    seedVoiceCallKnowledgeCardsV1();
    const card = getKnowledgeCardV1("VOICE-CALL-CALENDAR-DX-001");
    assert.ok(card);
    assert.match(card!.title, /Googleカレンダー自動同期/);
    assert.ok(card!.tags.includes("#VoiceAI"));
  });
});

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = "test-jwt-tenant-setting-summary-v1";
process.env.NODE_ENV = "test";
process.env.TISLY_DB_PATH = "./data/test-tenant-setting-summary-v1.db";
process.env.RATE_LIMIT_PROVIDER = "memory";

const {
  buildTenantSettingSummaryForSiteV1,
  buildTenantSettingSummaryJaV1,
} = await import("../src/shared/customer/tenant-setting-summary-v1.js");
const { closeDatabase } = await import("../src/db/database.js");

describe("tenant-setting-summary-v1", () => {
  after(() => {
    closeDatabase();
    try {
      fs.unlinkSync(path.resolve("data/test-tenant-setting-summary-v1.db"));
    } catch {
      /* 未作成でもよい */
    }
  });

  it("writes the daytime notify-only example", () => {
    const text = buildTenantSettingSummaryJaV1({
      scheduleStart: "18:00",
      scheduleEnd: "06:00",
      lightingDurationSec: 45,
      flashEnabled: false,
      flashDurationSec: 15,
      forceRelayTest: false,
      securityMode: "2STEP",
      mentionsFlash: true,
      mentionsMode: false,
      sensitivityParts: [],
      hideCameraOnCustomer: true,
      hideUnusedSensorsOnCustomer: true,
    });
    assert.equal(
      text,
      "昼間は通知のみ。夜間（18:00〜06:00）はセンサー検知で45秒間ライト点灯。至近検知時はフラッシュを起動しません。顧客側の画面ではカメラ映像と未使用センサーを非表示にしています。"
    );
  });

  it("mentions the test relay and flash seconds when those flags are on", () => {
    const text = buildTenantSettingSummaryJaV1({
      scheduleStart: "17:00",
      scheduleEnd: "06:00",
      lightingDurationSec: 130,
      flashEnabled: true,
      flashDurationSec: 15,
      forceRelayTest: true,
      securityMode: "two_stage_blink",
      mentionsFlash: true,
      mentionsMode: true,
      sensitivityParts: [{ label: "外周", ms: 100 }],
      hideCameraOnCustomer: true,
      hideUnusedSensorsOnCustomer: false,
    });
    assert.match(text, /昼間もセンサー連動でライトが動くテスト設定です/);
    assert.match(text, /夜間（17:00〜06:00）はセンサー検知で130秒間ライト点灯/);
    assert.match(text, /フラッシュを15秒起動します/);
    assert.match(text, /威嚇点滅/);
    assert.match(text, /感応度は外周100msです/);
    assert.match(text, /カメラ映像を非表示/);
    assert.doesNotMatch(text, /未使用センサー/);
  });

  it("reads Toyoshima defaults without rewriting stored rules", () => {
    const row = buildTenantSettingSummaryForSiteV1("SEC-JP-TOYOSHIMA-001");
    assert.ok(row);
    assert.equal(row.customerCode, "TOYOSHIMA001");
    assert.equal(row.displayName, "豊島邸");
    assert.match(
      row.summary,
      /夜間（\d{2}:\d{2}〜\d{2}:\d{2}）はセンサー検知で\d+秒間ライト点灯/
    );
    assert.match(
      row.summary,
      /感応度は外周\d+ms、建物至近\d+ms、はなれ\d+msです/
    );
    assert.match(row.summary, /カメラ映像と未使用センサーを非表示/);
  });

  it("reads Itabashi by the home site id", () => {
    const row = buildTenantSettingSummaryForSiteV1("HOME-JP-ITABASHI-LIVE");
    assert.ok(row);
    assert.equal(row.customerCode, "TOMS001");
    assert.match(
      row.summary,
      /感応度は駐車場\d+ms、ガレージ\d+msです/
    );
    assert.equal(
      buildTenantSettingSummaryForSiteV1("UNKNOWN-SITE"),
      null
    );
  });
});

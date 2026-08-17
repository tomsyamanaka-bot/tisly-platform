import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const publicDir = path.join(process.cwd(), "public");

function read(rel) {
  return fs.readFileSync(path.join(publicDir, rel), "utf-8");
}

describe("Offline + Voice Input v1", () => {
  it("offline core module exposes IndexedDB queue APIs", () => {
    const js = read("js/tisly-offline-core-v1.js");
    assert.match(js, /OFFLINE_CORE_VERSION = "offline-core-v1"/);
    assert.match(js, /enqueueOfflineSyncV1/);
    assert.match(js, /flushOfflineSyncQueueV1/);
    assert.match(js, /saveOfflineSnapshotV1/);
    assert.match(js, /tisly_offline_core_v1/);
    assert.match(js, /sync_queue/);
    assert.match(js, /snapshots/);
    // 既存データ破壊の全クリアは禁止
    assert.doesNotMatch(js, /clear\(\)/);
    assert.doesNotMatch(js, /deleteDatabase/);
  });

  it("online indicator shows JP labels", () => {
    const js = read("js/tisly-online-indicator-v1.js");
    const css = read("css/tisly-online-indicator-v1.css");
    assert.match(js, /📡 オンライン/);
    assert.match(js, /⚠️ オフライン作業中/);
    assert.match(js, /mountOnlineIndicatorV1/);
    assert.match(css, /tisly-conn-indicator/);
  });

  it("voice input parses estimate speech lines", () => {
    const js = read("js/tisly-voice-input-v1.js");
    assert.match(js, /VOICE_INPUT_VERSION = "voice-input-v1"/);
    assert.match(js, /parseEstimateSpeechLinesV1/);
    assert.match(js, /mountVoiceInputButtonV1/);
    assert.match(js, /SpeechRecognition/);
    assert.match(js, /webkitSpeechRecognition/);
    assert.match(js, /ja-JP/);
  });

  it("practical nav mounts online indicator", () => {
    const nav = read("js/tisly-practical-nav.js");
    assert.match(nav, /tisly-online-indicator-v1/);
    assert.match(nav, /mountOnlineIndicatorV1/);
  });

  it("estimate integrates voice + offline queue", () => {
    const js = read("js/estimate-v1.js");
    const html = read("estimate-v1.html");
    assert.match(js, /tisly-offline-core-v1/);
    assert.match(js, /tisly-voice-input-v1/);
    assert.match(js, /bindEstimateVoiceInputUi/);
    assert.match(js, /appendSpeechLinesToEstimate/);
    assert.match(js, /enqueueOfflineSyncV1/);
    assert.match(js, /estimate_items/);
    assert.match(html, /estimate-voice-line-mount/);
    assert.match(html, /🎙️ 音声で明細追加/);
    assert.match(html, /estimate-voice-notes-mount/);
  });

  it("knowledge quick/register and survey memo have voice mounts", () => {
    assert.match(read("knowledge-quick-v1.html"), /quick-voice-memo-mount/);
    assert.match(read("js/knowledge-quick-v1.js"), /mountVoiceInputButtonV1/);
    assert.match(read("js/knowledge-quick-v1.js"), /enqueueOfflineSyncV1/);
    assert.match(read("knowledge-register-v1.html"), /register-voice-summary-mount/);
    assert.match(read("js/knowledge-register-v1.js"), /mountVoiceInputButtonV1/);
    assert.match(read("survey-v1.html"), /survey-voice-memo-mount/);
    assert.match(read("js/survey-v1.js"), /mountVoiceInputButtonV1/);
  });

  it("service worker caches offline/voice assets and bumps version", () => {
    const sw = read("service-worker.js");
    assert.match(
      sw,
      /tisly-pwa-v2459-home-tile-grid|tisly-pwa-v2420-neon-dark/
    );
    assert.match(sw, /tisly-offline-core-v1\.js/);
    assert.match(sw, /tisly-voice-input-v1\.js/);
    assert.match(sw, /tisly-online-indicator-v1/);
    assert.match(sw, /tisly-offline-core-sync/);
  });

  it("parseEstimateSpeechLinesV1 heuristic is present for VVF / 台", () => {
    const js = read("js/tisly-voice-input-v1.js");
    assert.match(js, /メートル/);
    assert.match(js, /台\|個\|本/);
  });
});

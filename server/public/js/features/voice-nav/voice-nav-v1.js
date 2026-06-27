/**
 * 音声誘導ナビ v1 — メインブートストラップ
 * 音声合成 · 認識 · 複数回路シーケンス連動
 */
import {
  createVoiceNavSpeechV1,
  isVoiceNavSpeechSupportedV1,
} from "./voice-nav-speech-v1.js";
import {
  createInitialVoiceNavClientStateV1,
  createVoiceNavStateStoreV1,
  patchVoiceNavClientStateV1,
} from "./voice-nav-state-v1.js";
import {
  buildVoiceNavMultiCircuitSequenceClientV1,
  startVoiceNavSequenceClientV1,
  advanceVoiceNavSequenceClientV1,
} from "./voice-nav-sequence-v1.js";
import {
  renderVoiceNavPanelV1,
  appendVoiceNavLogV1,
} from "./voice-nav-ui-v1.js";
import {
  appendVoiceNavLogLocalV1,
  readVoiceNavLogLocalV1,
  syncVoiceNavLogToServerV1,
} from "./voice-nav-offline-v1.js";
import {
  bindOfflineResilienceAutoSyncV1,
  updateOfflineResilienceBadgeV1,
} from "../../offline-resilience-v1.js";

export const VOICE_NAV_V1_VERSION = "voice-nav-v1";

/**
 * @param {object} [opts]
 * @param {number} [opts.circuitCount] チェックする回路数（1〜8）
 * @param {number} [opts.startCircuit] 開始回路番号
 */
export function initVoiceNavV1(opts = {}) {
  const circuitCount = Math.min(8, Math.max(1, opts.circuitCount ?? 3));
  const startCircuit = opts.startCircuit ?? 1;
  const circuitNumbers = Array.from(
    { length: circuitCount },
    (_, i) => startCircuit + i
  );
  const urlParams = new URLSearchParams(location.search);
  const linkedSketchId = urlParams.get("sketchId") || opts.sketchId || null;
  const linkedProjectId = urlParams.get("projectId") || opts.projectId || null;
  const linkedBusinessProjectId =
    urlParams.get("businessProjectId") || opts.businessProjectId || null;

  /** @type {string} */
  let sessionId = crypto.randomUUID?.() || `vn-${Date.now()}`;
  /** @type {Array<{ at: string, role: string, text: string, circuitNumber?: number }>} */
  let voiceLogEntries = [];

  const els = {
    circuitEl: document.getElementById("voice-nav-circuit"),
    statusEl: document.getElementById("voice-nav-status"),
    mqttEl: document.getElementById("voice-nav-mqtt"),
    promptEl: document.getElementById("voice-nav-prompt"),
    micBtn: document.getElementById("voice-nav-mic"),
    micLabel: document.getElementById("voice-nav-mic-label"),
    logEl: document.getElementById("voice-nav-log"),
    startBtn: document.getElementById("voice-nav-start"),
    resetBtn: document.getElementById("voice-nav-reset"),
    circuitCountEl: document.getElementById("voice-nav-circuit-count"),
  };

  if (!els.startBtn) {
    return null;
  }

  function persistVoiceLogLine(role, text, circuitNumber) {
    const entry = {
      at: new Date().toISOString(),
      role,
      text,
      circuitNumber,
    };
    voiceLogEntries.push(entry);
    appendVoiceNavLogLocalV1(sessionId, entry);
  }

  function appendLogUi(line, role = "system", circuitNumber) {
    appendVoiceNavLogV1(els.logEl, line);
    persistVoiceLogLine(role, line, circuitNumber);
  }

  async function flushVoiceLogToServer() {
    if (!voiceLogEntries.length) return;
    const token = sessionStorage.getItem("tisly_token");
    const headers = token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    const result = await syncVoiceNavLogToServerV1(
      {
        sessionId,
        sketchId: linkedSketchId,
        projectId: linkedProjectId,
        businessProjectId: linkedBusinessProjectId,
        voiceLog: voiceLogEntries,
      },
      (url, init) => fetch(url, { ...init, headers: { ...headers, ...init.headers } })
    );

    if (result.queued) {
      appendVoiceNavLogV1(
        els.logEl,
        "オフライン — 音声ログを端末内に退避（復帰後に自動同期）"
      );
    }
  }

  bindOfflineResilienceAutoSyncV1(async (entry) => {
    if (entry.kind !== "voice_nav_log") return false;
    const token = sessionStorage.getItem("tisly_token");
    if (!entry.payload?.sketchId) return false;
    const res = await fetch(
      `/api/survey/v1/drawing-sketches/${encodeURIComponent(entry.payload.sketchId)}/ai-pipeline`,
      {
        method: "POST",
        headers: token
          ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceLog: entry.payload.voiceLog,
          businessProjectId: entry.payload.businessProjectId ?? null,
        }),
      }
    );
    return res.ok;
  });
  updateOfflineResilienceBadgeV1("voice-nav-offline-badge");

  if (!isVoiceNavSpeechSupportedV1()) {
    const main = document.querySelector(".voice-nav-v1-main");
    if (main) {
      const warn = document.createElement("p");
      warn.className = "voice-nav-v1-unsupported";
      warn.textContent =
        "このブラウザは Web Speech API に未対応です（Chrome 推奨）";
      main.prepend(warn);
    }
    els.startBtn.disabled = true;
    return null;
  }

  /** @type {ReturnType<typeof buildVoiceNavMultiCircuitSequenceClientV1>} */
  let steps = buildVoiceNavMultiCircuitSequenceClientV1(circuitNumbers);
  let sessionActive = false;
  let busy = false;

  const store = createVoiceNavStateStoreV1(
    createInitialVoiceNavClientStateV1(startCircuit),
    (state) => {
      renderVoiceNavPanelV1(els, state, {
        listening: speech.isListening(),
        speaking: speech.isSpeaking(),
      });
    }
  );

  const speech = createVoiceNavSpeechV1({
    onTranscript: (text) => handleTranscript(text),
    onError: (err) => {
      appendLogUi(`認識エラー: ${err}`, "system");
      if (sessionActive && !busy) {
        scheduleListenRetry();
      }
    },
    onListenStart: () => syncPanel(),
    onListenEnd: () => syncPanel(),
  });

  function readCircuitNumbers() {
    const count = Math.min(
      8,
      Math.max(1, Number(els.circuitCountEl?.value) || circuitCount)
    );
    const start = startCircuit;
    return Array.from({ length: count }, (_, i) => start + i);
  }

  function syncPanel() {
    renderVoiceNavPanelV1(els, store.getState(), {
      listening: speech.isListening(),
      speaking: speech.isSpeaking(),
    });
  }

  function setPrompt(text) {
    if (els.promptEl) {
      els.promptEl.textContent = text;
    }
  }

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  async function speakAndShow(text) {
    setPrompt(text);
    appendLogUi(`🔊 ${text}`, "system", store.getState().targetCircuitNumber);
    syncPanel();
    try {
      await speech.speak(text);
    } catch (e) {
      appendVoiceNavLogV1(
        els.logEl,
        `発話エラー: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    syncPanel();
  }

  function scheduleListenRetry() {
    window.setTimeout(() => {
      if (sessionActive && !busy && !speech.isSpeaking()) {
        speech.startListen();
        syncPanel();
      }
    }, 400);
  }

  /**
   * @param {string} transcript
   */
  async function handleTranscript(transcript) {
    if (!sessionActive || busy) return;
    appendLogUi(`🎤 ${transcript}`, "user", store.getState().targetCircuitNumber);
    busy = true;
    speech.stopListen();

    const prev = store.getState();
    const result = advanceVoiceNavSequenceClientV1(
      prev,
      steps,
      transcript,
      patchVoiceNavClientStateV1
    );
    store.patch(result.state);

    if (!result.advanced) {
      appendLogUi("もう一度「落とした」または「オッケー」と", "system");
      busy = false;
      scheduleListenRetry();
      return;
    }

    if (result.prompt) {
      await speakAndShow(result.prompt);
    }

    if (result.state.investigationStatus === "completed") {
      sessionActive = false;
      if (els.startBtn) els.startBtn.disabled = false;
      if (els.circuitCountEl) els.circuitCountEl.disabled = false;
      appendLogUi("✓ 全回路の停電チェック完了", "system");
      void flushVoiceLogToServer();
    } else {
      scheduleListenRetry();
    }

    busy = false;
    syncPanel();
  }

  async function onStart() {
    if (busy || sessionActive) return;
    busy = true;
    sessionActive = true;
    if (els.startBtn) els.startBtn.disabled = true;
    if (els.circuitCountEl) els.circuitCountEl.disabled = true;

    sessionId = crypto.randomUUID?.() || `vn-${Date.now()}`;
    voiceLogEntries = [];
    if (els.logEl) els.logEl.innerHTML = "";

    const nums = readCircuitNumbers();
    steps = buildVoiceNavMultiCircuitSequenceClientV1(nums);
    store.reset(nums[0] ?? startCircuit);

    const started = startVoiceNavSequenceClientV1(
      store.getState(),
      steps,
      patchVoiceNavClientStateV1
    );
    store.patch(started.state);

    appendLogUi(`▶ ${nums.length}回路チェック開始 (${nums.join(" → ")})`, "system");

    await speakAndShow(started.prompt);
    speech.startListen();
    syncPanel();
    busy = false;
  }

  function onReset() {
    sessionActive = false;
    busy = false;
    speech.stopListen();
    speech.stopSpeak();
    const nums = readCircuitNumbers();
    store.reset(nums[0] ?? startCircuit);
    steps = buildVoiceNavMultiCircuitSequenceClientV1(nums);
    sessionId = crypto.randomUUID?.() || `vn-${Date.now()}`;
    voiceLogEntries = [];
    setPrompt("スタートを押して音声誘導を開始");
    if (els.logEl) els.logEl.innerHTML = "";
    if (els.startBtn) els.startBtn.disabled = false;
    if (els.circuitCountEl) els.circuitCountEl.disabled = false;
    syncPanel();
  }

  els.startBtn.addEventListener("click", () => {
    void onStart();
  });
  els.resetBtn?.addEventListener("click", onReset);
  els.micBtn?.addEventListener("click", () => {
    if (sessionActive && !speech.isListening() && !speech.isSpeaking()) {
      speech.startListen();
      syncPanel();
    }
  });

  syncPanel();
  return { store, speech, destroy: () => speech.destroy() };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initVoiceNavV1());
} else {
  initVoiceNavV1();
}

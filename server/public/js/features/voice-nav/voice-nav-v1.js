/**
 * 音声誘導ナビ v1 — メインブートストラップ
 * 音声合成 · 認識 · 疑似シーケンスを連動
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
  buildVoiceNavDemoSequenceClientV1,
  startVoiceNavSequenceClientV1,
  advanceVoiceNavSequenceClientV1,
} from "./voice-nav-sequence-v1.js";
import {
  renderVoiceNavPanelV1,
  appendVoiceNavLogV1,
} from "./voice-nav-ui-v1.js";

export const VOICE_NAV_V1_VERSION = "voice-nav-v1";

/**
 * @param {object} [opts]
 * @param {number} [opts.circuitNumber]
 */
export function initVoiceNavV1(opts = {}) {
  const circuitNumber = opts.circuitNumber ?? 1;

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
  };

  if (!els.startBtn) {
    return null;
  }

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

  /** @type {ReturnType<typeof buildVoiceNavDemoSequenceClientV1>} */
  let steps = buildVoiceNavDemoSequenceClientV1(circuitNumber);
  let sessionActive = false;
  let busy = false;

  const store = createVoiceNavStateStoreV1(
    createInitialVoiceNavClientStateV1(circuitNumber),
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
      appendVoiceNavLogV1(els.logEl, `認識エラー: ${err}`);
      if (sessionActive && !busy) {
        scheduleListenRetry();
      }
    },
    onListenStart: () => syncPanel(),
    onListenEnd: () => syncPanel(),
  });

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
    appendVoiceNavLogV1(els.logEl, `🔊 ${text}`);
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
    appendVoiceNavLogV1(els.logEl, `🎤 ${transcript}`);
    busy = true;

    const prev = store.getState();
    const result = advanceVoiceNavSequenceClientV1(
      prev,
      steps,
      transcript,
      patchVoiceNavClientStateV1
    );
    store.patch(result.state);

    if (!result.advanced) {
      appendVoiceNavLogV1(els.logEl, "もう一度「落とした」または「オッケー」と");
      busy = false;
      scheduleListenRetry();
      return;
    }

    if (result.prompt) {
      await speakAndShow(result.prompt);
      if (result.state.investigationStatus === "verifying_outage") {
        store.patch({
          investigationStatus: "completed",
        });
        appendVoiceNavLogV1(els.logEl, "✓ 停電確認シーケンス完了（モック）");
      }
    }

    sessionActive = false;
    if (els.startBtn) els.startBtn.disabled = false;
    busy = false;
    syncPanel();
  }

  async function onStart() {
    if (busy || sessionActive) return;
    busy = true;
    sessionActive = true;
    if (els.startBtn) els.startBtn.disabled = true;

    store.reset(circuitNumber);
    steps = buildVoiceNavDemoSequenceClientV1(circuitNumber);
    const started = startVoiceNavSequenceClientV1(
      store.getState(),
      steps,
      patchVoiceNavClientStateV1
    );
    store.patch(started.state);

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
    store.reset(circuitNumber);
    setPrompt("スタートを押して音声誘導を開始");
    if (els.logEl) els.logEl.innerHTML = "";
    if (els.startBtn) els.startBtn.disabled = false;
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

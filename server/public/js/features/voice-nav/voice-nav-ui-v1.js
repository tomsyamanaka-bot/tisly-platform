/**
 * 音声誘導ナビ v1 — UI 更新ヘルパー
 * ステータスパネルとマイク表示の同期
 */

/** @typedef {import('./voice-nav-state-v1.js').VoiceNavClientState} VoiceNavClientState */

const STATUS_LABELS = {
  idle: "待機",
  awaiting_breaker_off: "ブレーカー操作待ち",
  verifying_outage: "停電確認中",
  outage_confirmed: "停電確認済",
  completed: "完了",
  error: "エラー",
};

/**
 * @param {object} els
 * @param {HTMLElement|null} els.circuitEl
 * @param {HTMLElement|null} els.statusEl
 * @param {HTMLElement|null} els.mqttEl
 * @param {HTMLElement|null} els.promptEl
 * @param {HTMLElement|null} els.micBtn
 * @param {HTMLElement|null} els.micLabel
 * @param {VoiceNavClientState} state
 * @param {object} [activity]
 * @param {boolean} [activity.listening]
 * @param {boolean} [activity.speaking]
 */
export function renderVoiceNavPanelV1(els, state, activity = {}) {
  const { listening = false, speaking = false } = activity;

  if (els.circuitEl) {
    els.circuitEl.textContent =
      state.investigationStatus === "idle"
        ? "—"
        : `${state.targetCircuitNumber} 番`;
  }

  if (els.statusEl) {
    const label = STATUS_LABELS[state.investigationStatus] ?? state.investigationStatus;
    els.statusEl.textContent = label;
    els.statusEl.className = "";
    if (state.investigationStatus === "idle") {
      els.statusEl.classList.add("voice-nav-v1-status-idle");
    } else if (state.investigationStatus === "error") {
      els.statusEl.classList.add("voice-nav-v1-status-error");
    } else if (state.investigationStatus === "verifying_outage") {
      els.statusEl.classList.add("voice-nav-v1-status-verify");
    } else {
      els.statusEl.classList.add("voice-nav-v1-status-active");
    }
  }

  if (els.mqttEl) {
    els.mqttEl.textContent = state.mqttRelayTopic ?? "—";
  }

  if (els.micBtn) {
    els.micBtn.classList.toggle("is-listening", listening);
    els.micBtn.classList.toggle("is-speaking", speaking && !listening);
  }

  if (els.micLabel) {
    els.micLabel.classList.toggle("is-active", listening);
    if (listening) {
      els.micLabel.textContent = "音声認識中";
    } else if (speaking) {
      els.micLabel.textContent = "発話中";
    } else {
      els.micLabel.textContent = "待機中";
    }
  }
}

/**
 * @param {HTMLUListElement|null} logEl
 * @param {string} line
 * @param {number} [maxLines]
 */
export function appendVoiceNavLogV1(logEl, line, maxLines = 8) {
  if (!logEl || !line) return;
  const li = document.createElement("li");
  li.textContent = line;
  logEl.prepend(li);
  while (logEl.children.length > maxLines) {
    logEl.removeChild(logEl.lastElementChild);
  }
}

/**
 * TiSLY PWA — DoorphoneCard / Viewer v1
 * TD-B30C 等スマートドアホン統合 UI
 */

import { escapeHtml, showToast } from "../home/home-shared-v1.js";

const HOME_API = "/api/home/v1";
const RELAY_PULSE_API = "/api/devices/rp2350/relay/1/pulse";
const WEB_FALLBACK =
  "https://www.irisohyama.co.jp/products/networkcamera/";
const UNLOCK_MS = 1000;

/** @type {string|null} */
let boundSiteId = null;
/** @type {Record<string, unknown>|null} */
let lastIntercom = null;

function $(id) {
  return document.getElementById(id);
}

function resolveSiteId() {
  const sel = $("hm-site-select");
  if (sel?.value) return sel.value;
  try {
    const q = new URLSearchParams(location.search).get("siteId");
    if (q) return q;
  } catch {
    /* ignore */
  }
  return boundSiteId || "HOME-JP-TSUKUBA-001";
}

function statusBadgeClass(badge) {
  if (badge === "ringing") return "is-ringing";
  if (badge === "recording") return "is-recording";
  if (badge === "live") return "is-live";
  return "is-idle";
}

/**
 * プレビュー枠 HTML
 * @param {Record<string, unknown>} ic
 */
function previewHtml(ic) {
  const badge = String(ic.statusBadge || "idle");
  const badgeLabel = String(ic.statusBadgeLabel || "待機中");
  const streamKind = escapeHtml(String(ic.streamKindLabel || "—"));
  const ringing = Boolean(ic.ringing);

  let inner;
  if (ic.streamUrl) {
    inner = `<div class="dp-preview-stream" role="img" aria-label="ライブ映像">
      <span class="dp-preview-live-dot"></span>
      WebRTC プレビュー（中継接続待ち）
    </div>`;
  } else if (ic.snapshotUrl) {
    const src = `${String(ic.snapshotUrl)}&t=${Date.now()}`;
    inner = `<img class="dp-preview-img" src="${escapeHtml(src)}" alt="玄関前スナップショット" loading="lazy" />`;
  } else {
    inner = `<div class="dp-preview-placeholder">
      <strong>${ringing ? "🔔" : "📷"}</strong>
      <span>${ringing ? "玄関に来客がいます" : "カメラ映像はここに表示されます"}</span>
    </div>`;
  }

  return `
    <div class="dp-preview ${ringing ? "is-ringing" : ""}">
      ${inner}
      <span class="dp-badge ${statusBadgeClass(badge)}">${escapeHtml(badgeLabel)}</span>
      <span class="dp-stream-tag">${streamKind}</span>
    </div>`;
}

/**
 * コントロールボタン群 HTML
 * @param {Record<string, unknown>} ic
 * @param {{ withUnlock?: boolean }} options
 */
function controlsHtml(ic, options = {}) {
  const micOn = !Boolean(ic.micMuted);
  const vol = Number(ic.speakerVolume ?? 70);
  const recording = Boolean(ic.recording);
  const allowUnlock =
    Boolean(ic.unlockLinkEnabled) && options.withUnlock !== false;

  return `
    <div class="dp-controls" role="group" aria-label="ドアホン操作">
      <button type="button" class="dp-btn dp-btn-primary" data-dp-action="answer">
        📞 通話応答
      </button>
      <button type="button" class="dp-btn" data-dp-action="toggle_mic" aria-pressed="${micOn}">
        ${micOn ? "🎙️ マイクON" : "🔇 ミュート"}
      </button>
      <button type="button" class="dp-btn" data-dp-action="toggle_speaker_mute">
        ${vol <= 0 ? "🔈 音量復帰" : `🔊 音量 ${vol}%`}
      </button>
      <button type="button" class="dp-btn" data-dp-action="snapshot">
        📸 スナップ保存
      </button>
      <button type="button" class="dp-btn ${recording ? "is-active" : ""}" data-dp-action="${recording ? "record_stop" : "record_start"}">
        ${recording ? "⏹ 録画停止" : "🎥 録画開始"}
      </button>
    </div>
    ${
      allowUnlock
        ? `<button type="button" class="dp-unlock-btn" data-dp-action="unlock">
             🚪 玄関電気錠 解錠
           </button>
           <p class="dp-unlock-hint">RP2350 リレー RO1 · 約1秒パルス</p>`
        : ""
    }`;
}

/**
 * DoorphoneCard を描画
 * @param {Record<string, unknown>} ic
 * @param {{ withUnlock?: boolean, siteId?: string }} [options]
 */
export function renderDoorphoneViewerV1(ic, options = {}) {
  if (!ic) return;
  lastIntercom = ic;
  if (options.siteId) boundSiteId = options.siteId;

  const root = $("hm-intercom-frame");
  if (!root) return;

  const modelNote = ic.modelLabel
    ? `<p class="dp-model-note">${escapeHtml(String(ic.modelLabel))}</p>`
    : "";

  root.innerHTML = `
    <div class="dp-viewer" id="hm-doorphone-viewer">
      ${modelNote}
      ${previewHtml(ic)}
      ${controlsHtml(ic, options)}
    </div>`;

  /* 旧ボタン行は DoorphoneCard に統合済み */
  const legacyRow = root.closest(".hm-detail-panel")?.querySelector(".hm-btn-row");
  if (legacyRow) legacyRow.hidden = true;

  bindDoorphoneViewerEventsV1(options);
}

async function postDoorphone(action, value) {
  const siteId = resolveSiteId();
  const res = await fetch(`${HOME_API}/doorphone/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, action, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `操作失敗 (${res.status})`);
  }
  return data;
}

async function postIntercom(action, value) {
  const siteId = resolveSiteId();
  const res = await fetch(`${HOME_API}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId,
      target: "intercom",
      action,
      value,
      actor: "doorphone-viewer-v1",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `操作失敗 (${res.status})`);
  }
  return data;
}

function openAnswerDeepLink() {
  const link =
    (lastIntercom && String(lastIntercom.answerDeepLink)) ||
    "irisdoorphone://answer";
  const fallbackTimer = setTimeout(() => {
    window.open(WEB_FALLBACK, "_blank", "noopener,noreferrer");
  }, 900);
  try {
    const a = document.createElement("a");
    a.href = link;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    clearTimeout(fallbackTimer);
    window.open(WEB_FALLBACK, "_blank", "noopener,noreferrer");
    return;
  }
  showToast("通話アプリを起動しています…");
}

async function pulseUnlock(btn) {
  if (btn) btn.disabled = true;
  const siteId = resolveSiteId();
  try {
    const res = await fetch(RELAY_PULSE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        durationMs: UNLOCK_MS,
        reason: "doorphone_unlock",
        siteId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `リレー失敗 (${res.status})`);
    }
    await postIntercom("unlock_door");
    showToast("玄関電気錠へ解錠信号を送信しました");
  } catch (err) {
    showToast(err.message || "解錠に失敗しました");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function mergeIntercomPatch(patch) {
  if (!lastIntercom || !patch) return lastIntercom;
  return { ...lastIntercom, ...patch };
}

function bindDoorphoneViewerEventsV1(options = {}) {
  const root = $("hm-doorphone-viewer");
  if (!root || root.dataset.bound === "1") {
    if (root) attachDoorphoneClickHandlers(root, options);
    return;
  }
  root.dataset.bound = "1";
  attachDoorphoneClickHandlers(root, options);
}

function attachDoorphoneClickHandlers(root, options) {
  root.querySelectorAll("[data-dp-action]").forEach((btn) => {
    if (btn.dataset.dpBound === "1") return;
    btn.dataset.dpBound = "1";
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-dp-action");
      if (!action) return;
      btn.disabled = true;
      try {
        if (action === "answer") {
          openAnswerDeepLink();
          await postIntercom("answer");
          showToast("通話応答を開始しました");
          return;
        }
        if (action === "unlock") {
          await pulseUnlock(btn);
          return;
        }
        const data = await postDoorphone(action);
        showToast(data.message || "操作しました");
        if (data.doorphone && lastIntercom) {
          const merged = mergeIntercomPatch({
            micMuted: data.doorphone.micMuted,
            speakerVolume: data.doorphone.speakerVolume,
            recording: data.doorphone.recording,
            statusBadge: data.doorphone.statusBadge,
            statusBadgeLabel: data.doorphone.statusBadgeLabel,
            snapshotUrl: data.snapshotUrl || lastIntercom.snapshotUrl,
          });
          renderDoorphoneViewerV1(merged, options);
        }
      } catch (err) {
        showToast(err.message || String(err));
      } finally {
        if (action !== "unlock") btn.disabled = false;
      }
    });
  });
}

export function mountDoorphoneViewerFromDashboardV1(dashboard, options = {}) {
  if (!dashboard?.intercom) return;
  renderDoorphoneViewerV1(dashboard.intercom, {
    ...options,
    siteId: dashboard.siteId,
  });
}

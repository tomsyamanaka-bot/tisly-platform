/**
 * TiSLY Security — 玄関インターホン連携カード v1
 * TD-SM5030CT-BSH × RP2350 CH1 解錠
 */

import {
  resolveHomeSiteId,
  showSecurityRemoteToastV1,
} from "./security-floor-remote-config-v1.js";

const HOME_API = "/api/home/v1";
const RELAY_PULSE_API = "/api/devices/rp2350/relay/1/pulse";
const UNLOCK_MS = 1000;

/** HomeLink 深いリンク（未対応時は Web へ） */
const HOMELINK_DEEP = "homelink://answer";
const HOMELINK_WEB =
  "https://www.irisohyama.co.jp/products/networkcamera/";

/** @type {"idle"|"ringing"} */
let visitorState = "idle";
/** @type {ReturnType<typeof setTimeout>|null} */
let ringClearTimer = null;

function $(id) {
  return document.getElementById(id);
}

function homeSiteId() {
  const sel = $("sf-site-select");
  return resolveHomeSiteId((sel && sel.value) || "SEC-JP-MORIYA-001");
}

function showToast(message) {
  showSecurityRemoteToastV1(message);
}

/**
 * 来客ステータス UI を同期
 * @param {"idle"|"ringing"} state
 */
function setVisitorState(state) {
  visitorState = state;
  const badge = $("sf-intercom-status-badge");
  const card = $("sf-intercom-link");
  if (badge) {
    badge.classList.toggle("is-ringing", state === "ringing");
    badge.classList.toggle("is-idle", state === "idle");
    badge.textContent = state === "ringing" ? "呼出中" : "待機中";
  }
  if (card) {
    card.classList.toggle("is-ringing", state === "ringing");
  }
}

/**
 * 呼出トースト＋バッジ
 * @param {string} [note]
 */
export function notifyIntercomRingV1(note) {
  setVisitorState("ringing");
  showToast(note || "玄関インターホン呼出 — 応答または解錠できます");
  if (ringClearTimer) clearTimeout(ringClearTimer);
  /* デモ: 45 秒で待機へ戻す */
  ringClearTimer = setTimeout(() => {
    setVisitorState("idle");
  }, 45000);
}

async function pulseUnlockRelay(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(RELAY_PULSE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        durationMs: UNLOCK_MS,
        reason: "smart_intercom_unlock",
        siteId: homeSiteId(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `リレー失敗 (${res.status})`);
    }
    /* Home 側インターホン解錠も併送（あれば） */
    try {
      await fetch(`${HOME_API}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: homeSiteId(),
          target: "intercom",
          action: "unlock_door",
          actor: "security-v1-intercom",
        }),
      });
    } catch {
      /* リレー成功を優先 */
    }
    showToast("電気錠へ解錠パルス（CH1・1秒）を送信しました");
    setVisitorState("idle");
  } catch (err) {
    showToast(err.message || "解錠に失敗しました");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openCallAnswer() {
  /* Deep Link 試行 → Web フォールバック */
  const fallbackTimer = setTimeout(() => {
    window.open(HOMELINK_WEB, "_blank", "noopener,noreferrer");
  }, 900);
  try {
    const a = document.createElement("a");
    a.href = HOMELINK_DEEP;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    clearTimeout(fallbackTimer);
    window.open(HOMELINK_WEB, "_blank", "noopener,noreferrer");
    return;
  }
  showToast("通話アプリを起動しています…");
  /* Home API answer（ベストエフォート） */
  fetch(`${HOME_API}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: homeSiteId(),
      target: "intercom",
      action: "answer",
      actor: "security-v1-intercom",
    }),
  }).catch(() => {});
}

function bindIntercomUi() {
  if (window.__TISLY_SF_INTERCOM_BOUND) return;
  window.__TISLY_SF_INTERCOM_BOUND = true;

  $("sf-intercom-answer")?.addEventListener("click", (e) => {
    e.preventDefault();
    openCallAnswer();
  });

  const unlockBtn = $("sf-intercom-unlock");
  const armToggle = $("sf-intercom-unlock-arm");
  unlockBtn?.addEventListener("click", () => {
    if (!armToggle?.checked) {
      showToast("解錠前に「解錠を許可」をONにしてください");
      return;
    }
    pulseUnlockRelay(unlockBtn).then(() => {
      if (armToggle) armToggle.checked = false;
      syncUnlockArmed();
    });
  });

  armToggle?.addEventListener("change", syncUnlockArmed);

  $("sf-intercom-sim-ring")?.addEventListener("click", () => {
    /* 呼出シミュレーション */
    notifyIntercomRingV1(
      "【シミュレーション】玄関ドアホン呼出を受信しました"
    );
    fetch(`${HOME_API}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: homeSiteId(),
        target: "intercom",
        action: "ring",
        actor: "security-v1-intercom-sim",
      }),
    }).catch(() => {});
  });

  /* WS / カスタムイベントで呼出を受信 */
  window.addEventListener("tisly:intercom-ring", (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail;
    notifyIntercomRingV1(
      detail?.message || "玄関インターホン呼出を受信しました"
    );
  });

  syncUnlockArmed();
  setVisitorState("idle");
}

function syncUnlockArmed() {
  const arm = $("sf-intercom-unlock-arm");
  const btn = $("sf-intercom-unlock");
  if (!btn) return;
  const on = Boolean(arm?.checked);
  btn.disabled = !on;
  btn.classList.toggle("is-armed", on);
}

export function mountSecurityIntercomPanelV1() {
  const root = $("sf-intercom-link");
  if (!root) return;
  bindIntercomUi();
}

mountSecurityIntercomPanelV1();

/**
 * TiSLY HOME — 玄関インターホン連携カード
 * TD-SM5030CT-BSH × RP2350 CH1
 */

import { showToast } from "./home-shared-v1.js";

const HOME_API = "/api/home/v1";
const RELAY_PULSE_API = "/api/devices/rp2350/relay/1/pulse";
const UNLOCK_MS = 1000;
const DEFAULT_SITE = "HOME-JP-ITABASHI-LIVE";

/** HomeLink 深いリンク（未対応時は Web） */
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

function resolveSiteId() {
  const sel = $("hm-site-select");
  if (sel?.value) return sel.value;
  try {
    const q = new URLSearchParams(location.search).get("siteId");
    if (q) return q;
  } catch {
    /* ignore */
  }
  return DEFAULT_SITE;
}

/**
 * @param {"idle"|"ringing"} state
 */
function setVisitorState(state) {
  visitorState = state;
  const badge = $("hm-intercom-link-badge");
  const card = $("hm-intercom-link");
  if (badge) {
    badge.classList.toggle("is-ringing", state === "ringing");
    badge.classList.toggle("is-idle", state === "idle");
    badge.textContent = state === "ringing" ? "呼出中" : "待機中";
  }
  if (card) card.classList.toggle("is-ringing", state === "ringing");
}

/**
 * 呼出トースト＋バッジ
 * @param {string} [note]
 */
export function notifyHomeIntercomRingV1(note) {
  setVisitorState("ringing");
  showToast(note || "玄関インターホン呼出 — 応答または解錠できます");
  if (ringClearTimer) clearTimeout(ringClearTimer);
  ringClearTimer = setTimeout(() => setVisitorState("idle"), 45000);
}

async function pulseUnlockRelay(btn) {
  if (btn) btn.disabled = true;
  const siteId = resolveSiteId();
  try {
    const res = await fetch(RELAY_PULSE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        durationMs: UNLOCK_MS,
        reason: "home_intercom_unlock",
        siteId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `リレー失敗 (${res.status})`);
    }
    try {
      await fetch(`${HOME_API}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          target: "intercom",
          action: "unlock_door",
          actor: "home-v1-intercom-link",
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
  fetch(`${HOME_API}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: resolveSiteId(),
      target: "intercom",
      action: "answer",
      actor: "home-v1-intercom-link",
    }),
  }).catch(() => {});
}

function syncUnlockArmed() {
  const arm = $("hm-intercom-link-arm");
  const btn = $("hm-intercom-link-unlock");
  if (!btn) return;
  const on = Boolean(arm?.checked);
  btn.disabled = !on;
  btn.classList.toggle("is-armed", on);
}

function bindUi() {
  if (window.__TISLY_HM_INTERCOM_LINK_BOUND) return;
  window.__TISLY_HM_INTERCOM_LINK_BOUND = true;

  $("hm-intercom-link-answer")?.addEventListener("click", (e) => {
    e.preventDefault();
    openCallAnswer();
  });

  const unlockBtn = $("hm-intercom-link-unlock");
  const armToggle = $("hm-intercom-link-arm");
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

  $("hm-intercom-link-sim")?.addEventListener("click", () => {
    notifyHomeIntercomRingV1(
      "【シミュレーション】玄関ドアホン呼出を受信しました"
    );
    fetch(`${HOME_API}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: resolveSiteId(),
        target: "intercom",
        action: "ring",
        actor: "home-v1-intercom-sim",
      }),
    }).catch(() => {});
  });

  window.addEventListener("tisly:intercom-ring", (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail;
    notifyHomeIntercomRingV1(
      detail?.message || "玄関インターホン呼出を受信しました"
    );
  });

  syncUnlockArmed();
  setVisitorState("idle");
}

export function mountHomeIntercomLinkPanelV1() {
  if (!$("hm-intercom-link")) return;
  bindUi();
}

mountHomeIntercomLinkPanelV1();

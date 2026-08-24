/**
 * TiSLY Security — 遠隔防犯ルール設定パネル
 * RP2350（板橋自宅）と /api/home/v1/security/config 連動
 */

const HOME_API = "/api/home/v1";
const DEFAULT_HOME_SITE = "HOME-JP-ITABASHI-LIVE";

/** 3D Security 物件 → HOME API 実機 */
const SF_HOME_SITE_MAP = {
  "SEC-JP-ITABASHI-LIVE": DEFAULT_HOME_SITE,
  "SEC-JP-MORIYA-001": DEFAULT_HOME_SITE,
  "SEC-JP-TSUKUBA-001": "HOME-JP-TSUKUBA-001",
};

/** Web Push 条件トグル：緊急 → サイレント → OFF → 緊急… */
const NOTIFY_MODE_CYCLE = ["critical", "silent", "off"];

const NOTIFY_ID_TO_FIELD = {
  di1_alone: "notifyDi1Mode",
  staged_intrusion: "notifyStagedMode",
  di2_alone: "notifyDi2Mode",
};

const state = {
  homeSiteId: DEFAULT_HOME_SITE,
  guardMode: "night_only",
  paused: false,
  notifyModes: {
    notifyDi1Mode: "silent",
    notifyStagedMode: "critical",
    notifyDi2Mode: "critical",
  },
};

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function showToast(message) {
  let el = $("sf-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "sf-toast";
    el.className = "sf-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.remove("is-visible");
  }, 3200);
}

/** Security 物件 ID → RP2350 用 HOME siteId */
export function resolveHomeSiteId(securitySiteId) {
  const id = String(securitySiteId || "").trim();
  return SF_HOME_SITE_MAP[id] || DEFAULT_HOME_SITE;
}

function readSegValue(groupId) {
  const group = $(groupId);
  if (!group) return "";
  const on = group.querySelector(".sf-seg-btn.is-on");
  return on?.dataset?.value || "";
}

function setSegValue(groupId, value) {
  const group = $(groupId);
  if (!group) return;
  group.querySelectorAll(".sf-seg-btn").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.value === value);
  });
}

function bindSegGroup(groupId, onChange) {
  const group = $(groupId);
  if (!group) return;
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".sf-seg-btn");
    if (!btn) return;
    group.querySelectorAll(".sf-seg-btn").forEach((b) => {
      b.classList.toggle("is-on", b === btn);
    });
    if (typeof onChange === "function") onChange(btn.dataset.value);
  });
}

function bindSlider(sliderId, labelId) {
  const slider = $(sliderId);
  if (!slider) return;
  slider.addEventListener("input", () => {
    setText(labelId, slider.value);
  });
}

function readSlider(id, fallback) {
  const el = $(id);
  if (!el) return fallback;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNotifyMode(mode) {
  if (mode === "critical" || mode === "silent" || mode === "off") return mode;
  return "off";
}

function nextNotifyMode(mode) {
  const cur = normalizeNotifyMode(mode);
  const idx = NOTIFY_MODE_CYCLE.indexOf(cur);
  return NOTIFY_MODE_CYCLE[(idx + 1) % NOTIFY_MODE_CYCLE.length];
}

function notifyLabelFor(id, mode) {
  const m = normalizeNotifyMode(mode);
  if (id === "di1_alone") {
    if (m === "critical") return "DI1単独：緊急通知ON";
    if (m === "silent") return "DI1単独：サイレント";
    return "DI1単独：OFF";
  }
  if (id === "staged_intrusion") {
    if (m === "critical") return "DI1➔DI2段階侵入：緊急通知ON";
    if (m === "silent") return "DI1➔DI2段階侵入：サイレント";
    return "DI1➔DI2段階侵入：OFF";
  }
  if (m === "critical") return "DI2単独：即時Web Push";
  if (m === "silent") return "DI2単独：サイレント";
  return "DI2単独：OFF";
}

function applyNotifyRowUi(li, mode) {
  const m = normalizeNotifyMode(mode);
  const badge = li.querySelector(".sf-notify-badge");
  const text = li.querySelector(".sf-notify-text");
  const id = li.dataset.notifyId || "";
  li.dataset.notifyMode = m;
  li.classList.remove("is-critical", "is-silent", "is-off", "is-on");
  if (m === "critical") {
    li.classList.add("is-critical");
    li.setAttribute("aria-pressed", "true");
    if (badge) {
      badge.textContent = "緊急";
      badge.className = "sf-notify-badge is-critical";
    }
  } else if (m === "silent") {
    li.classList.add("is-silent");
    li.setAttribute("aria-pressed", "false");
    if (badge) {
      badge.textContent = "サイレント";
      badge.className = "sf-notify-badge is-silent";
    }
  } else {
    li.classList.add("is-off");
    li.setAttribute("aria-pressed", "false");
    if (badge) {
      badge.textContent = "OFF";
      badge.className = "sf-notify-badge is-off";
    }
  }
  if (text) text.textContent = notifyLabelFor(id, m);
}

function syncNotifyModesFromRules(rules, notifyPolicy) {
  if (rules?.notifyDi1Mode) {
    state.notifyModes.notifyDi1Mode = normalizeNotifyMode(rules.notifyDi1Mode);
  } else if (rules) {
    state.notifyModes.notifyDi1Mode = rules.notifyDi1SilentLogOnly
      ? "silent"
      : "critical";
  }
  if (rules?.notifyStagedMode) {
    state.notifyModes.notifyStagedMode = normalizeNotifyMode(
      rules.notifyStagedMode
    );
  }
  if (rules?.notifyDi2Mode) {
    state.notifyModes.notifyDi2Mode = normalizeNotifyMode(rules.notifyDi2Mode);
  } else if (rules) {
    state.notifyModes.notifyDi2Mode = rules.notifyDi2InstantPush
      ? "critical"
      : "off";
  }

  /* policy.rows[].mode があれば優先 */
  for (const row of notifyPolicy?.rows || []) {
    const field = NOTIFY_ID_TO_FIELD[row.id];
    if (field && row.mode) {
      state.notifyModes[field] = normalizeNotifyMode(row.mode);
    }
  }
}

function renderNotifyPolicy(notifyPolicy) {
  if (notifyPolicy?.perimeterTimeoutSec != null) {
    const hint = $("sf-notify-policy-hint");
    if (hint) {
      hint.textContent = `駐車場センサー検知後 ${notifyPolicy.perimeterTimeoutSec} 秒以内のガレージセンサーで段階侵入（タップで緊急/サイレント/OFF切替）`;
    }
  }
  const list = $("sf-notify-policy");
  if (!list) return;
  for (const [id, field] of Object.entries(NOTIFY_ID_TO_FIELD)) {
    const li = list.querySelector(`[data-notify-id="${id}"]`);
    if (!li) continue;
    applyNotifyRowUi(li, state.notifyModes[field]);
  }
  if (notifyPolicy?.rows?.length) {
    for (const row of notifyPolicy.rows) {
      const li = list.querySelector(`[data-notify-id="${row.id}"]`);
      if (!li) continue;
      const mode = row.mode || state.notifyModes[NOTIFY_ID_TO_FIELD[row.id]];
      applyNotifyRowUi(li, mode);
      const text = li.querySelector(".sf-notify-text");
      if (text && row.label) text.textContent = row.label;
    }
  }
}

function cycleNotifyRow(li) {
  const id = li?.dataset?.notifyId;
  const field = NOTIFY_ID_TO_FIELD[id];
  if (!field) return;
  const next = nextNotifyMode(state.notifyModes[field] || li.dataset.notifyMode);
  state.notifyModes[field] = next;
  applyNotifyRowUi(li, next);
}

function syncLightingDurationSliders(sec) {
  const val = String(sec);
  const master = $("sf-lighting-duration");
  if (master) master.value = val;
  setText("sf-lighting-duration-val", val);
  const di1 = $("sf-di1-duration");
  if (di1) di1.value = val;
  setText("sf-di1-duration-val", val);
  const di2 = $("sf-di2-alert-duration");
  if (di2) di2.value = val;
  setText("sf-di2-alert-duration-val", val);
  const solo = $("sf-di2solo-duration");
  if (solo) solo.value = val;
  setText("sf-di2solo-duration-val", val);
}

function renderRules(rules, notifyPolicy) {
  if (!rules) return;
  state.guardMode = rules.guardMode || "night_only";
  state.paused = Boolean(
    rules.securityPausedUntil &&
      Date.parse(rules.securityPausedUntil) > Date.now()
  );

  if (state.paused) {
    setSegValue("sf-guard-seg", "paused");
  } else {
    setSegValue("sf-guard-seg", state.guardMode);
  }

  const lightingSec =
    rules.lightingDurationSec ?? rules.di1DurationSec ?? 45;
  syncLightingDurationSliders(lightingSec);
  setSegValue("sf-di1-24v-seg", rules.di1LightMode || "steady");

  const peri = $("sf-perimeter-timeout");
  if (peri) {
    peri.value = String(rules.perimeterTimeoutSec ?? 120);
    setText("sf-perimeter-timeout-val", peri.value);
  }
  setSegValue("sf-di2-24v-seg", rules.di2LightMode || "fast_blink");
  setSegValue("sf-di2-100v-seg", rules.di2Light100vMode || "steady");

  setSegValue(
    "sf-di2solo-24v-seg",
    rules.di2Standalone24vMode || "steady"
  );
  setSegValue(
    "sf-di2solo-100v-seg",
    rules.di2Standalone100vMode || "steady"
  );
  syncNotifyModesFromRules(rules, notifyPolicy);
  renderNotifyPolicy(notifyPolicy);
}

async function fetchRules(homeSiteId) {
  const res = await fetch(
    `${HOME_API}/security-rules?siteId=${encodeURIComponent(homeSiteId)}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "設定取得に失敗");
  return { rules: data.rules, notifyPolicy: data.notifyPolicy };
}

function collectPayload(homeSiteId) {
  const guardSeg = readSegValue("sf-guard-seg");
  const notifyDi1Mode = normalizeNotifyMode(state.notifyModes.notifyDi1Mode);
  const notifyStagedMode = normalizeNotifyMode(
    state.notifyModes.notifyStagedMode
  );
  const notifyDi2Mode = normalizeNotifyMode(state.notifyModes.notifyDi2Mode);
  const payload = {
    siteId: homeSiteId,
    actor: "security-v1",
    lightingDurationSec: readSlider("sf-lighting-duration", 45),
    di1DurationSec: readSlider("sf-di1-duration", 45),
    di1LightMode: readSegValue("sf-di1-24v-seg") || "steady",
    perimeterTimeoutSec: readSlider("sf-perimeter-timeout", 120),
    di2LightMode: readSegValue("sf-di2-24v-seg") || "fast_blink",
    di2Light100vMode: readSegValue("sf-di2-100v-seg") || "steady",
    di2AlertDurationSec: readSlider("sf-di2-alert-duration", 45),
    di2StandaloneDurationSec: readSlider("sf-di2solo-duration", 45),
    di2Standalone24vMode:
      readSegValue("sf-di2solo-24v-seg") || "steady",
    di2Standalone100vMode:
      readSegValue("sf-di2solo-100v-seg") || "steady",
    notifyDi1Mode,
    notifyStagedMode,
    notifyDi2Mode,
    notifyDi1SilentLogOnly: notifyDi1Mode !== "critical",
    notifyDi2InstantPush: notifyDi2Mode === "critical",
  };

  if (guardSeg === "paused") {
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    payload.securityPausedUntil = until;
    payload.guardMode = state.guardMode || "night_only";
  } else {
    payload.guardMode = guardSeg || "night_only";
    payload.securityPausedUntil = null;
  }
  return payload;
}

async function postSecurityConfig(homeSiteId, payload) {
  const res = await fetch(`${HOME_API}/security/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "反映に失敗しました");
  renderRules(data.rules, data.notifyPolicy);
  return data;
}

async function applyToDevice(homeSiteId) {
  const payload = collectPayload(homeSiteId);
  return postSecurityConfig(homeSiteId, payload);
}

/** 警戒モード切替 — タップ直後にサーバー保存・実機同期 */
async function applyGuardModeImmediate(value) {
  const homeSiteId = state.homeSiteId;
  const payload = {
    siteId: homeSiteId,
    actor: "security-v1",
  };
  if (value === "paused") {
    payload.securityPausedUntil = new Date(Date.now() + 60 * 60_000).toISOString();
    payload.guardMode = state.guardMode || "night_only";
    state.paused = true;
    setSegValue("sf-guard-seg", "paused");
  } else {
    payload.guardMode = value;
    payload.securityPausedUntil = null;
    state.guardMode = value;
    state.paused = false;
    setSegValue("sf-guard-seg", value);
  }
  const data = await postSecurityConfig(homeSiteId, payload);
  const label =
    value === "paused"
      ? "警戒一時解除"
      : value === "always"
        ? "24時間警戒"
        : "夜間のみ";
  showToast(`${label} を反映しました`);
  return data;
}

function updateTargetLabel(homeSiteId) {
  setText("sf-remote-target", `実機: ${homeSiteId}`);
  state.homeSiteId = homeSiteId;
}

/** 物件切替時に呼ぶ */
export async function refreshSecurityRemoteConfigV1(securitySiteId) {
  const homeSiteId = resolveHomeSiteId(securitySiteId);
  updateTargetLabel(homeSiteId);
  try {
    const payload = await fetchRules(homeSiteId);
    renderRules(payload.rules, payload.notifyPolicy);
  } catch {
    /* 未取得でも UI は操作可能 */
  }
}

function bindNotifyPolicyToggles() {
  const list = $("sf-notify-policy");
  if (!list || list.dataset.toggleBound === "1") return;
  list.dataset.toggleBound = "1";
  list.addEventListener("click", (e) => {
    const li = e.target.closest(".sf-notify-policy-item");
    if (!li || !list.contains(li)) return;
    e.preventDefault();
    cycleNotifyRow(li);
  });
  list.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const li = e.target.closest(".sf-notify-policy-item");
    if (!li || !list.contains(li)) return;
    e.preventDefault();
    cycleNotifyRow(li);
  });
}

let lightingDebounceTimer = null;

function scheduleLightingDurationSync() {
  clearTimeout(lightingDebounceTimer);
  lightingDebounceTimer = setTimeout(() => {
    const sec = readSlider("sf-lighting-duration", 45);
    syncLightingDurationSliders(sec);
    applyToDevice(state.homeSiteId)
      .then((data) => {
        showToast(data.message || "ライト点灯時間を実機へ反映しました");
      })
      .catch((err) => {
        showToast(err.message || "点灯時間の反映に失敗しました");
      });
  }, 3000);
}

function bindRemoteConfigUi() {
  if (window.__TISLY_SF_REMOTE_BOUND) return;
  window.__TISLY_SF_REMOTE_BOUND = true;

  bindSlider("sf-lighting-duration", "sf-lighting-duration-val");
  bindSlider("sf-di1-duration", "sf-di1-duration-val");
  bindSlider("sf-perimeter-timeout", "sf-perimeter-timeout-val");
  bindSlider("sf-di2-alert-duration", "sf-di2-alert-duration-val");
  bindSlider("sf-di2solo-duration", "sf-di2solo-duration-val");

  $("sf-lighting-duration")?.addEventListener("input", () => {
    const sec = readSlider("sf-lighting-duration", 45);
    syncLightingDurationSliders(sec);
    scheduleLightingDurationSync();
  });

  bindSegGroup("sf-guard-seg", (value) => {
    applyGuardModeImmediate(value).catch((err) => {
      showToast(err.message || "警戒モードの反映に失敗しました");
      refreshSecurityRemoteConfigV1(
        $("sf-site-select")?.value || "SEC-JP-MORIYA-001"
      ).catch(() => {});
    });
  });
  bindSegGroup("sf-di1-24v-seg");
  bindSegGroup("sf-di2-24v-seg");
  bindSegGroup("sf-di2-100v-seg");
  bindSegGroup("sf-di2solo-24v-seg");
  bindSegGroup("sf-di2solo-100v-seg");
  bindNotifyPolicyToggles();

  $("sf-remote-apply")?.addEventListener("click", async () => {
    const btn = $("sf-remote-apply");
    if (!btn) return;
    btn.disabled = true;
    try {
      const data = await applyToDevice(state.homeSiteId);
      showToast(data.message || "実機へ設定を反映しました");
    } catch (err) {
      showToast(err.message || "反映に失敗しました");
    } finally {
      btn.disabled = false;
    }
  });

  refreshSecurityRemoteConfigV1(
    $("sf-site-select")?.value || "SEC-JP-MORIYA-001"
  ).catch(() => {});
}

bindRemoteConfigUi();

export { showToast as showSecurityRemoteToastV1 };

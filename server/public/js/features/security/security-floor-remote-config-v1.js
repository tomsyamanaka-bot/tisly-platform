/**
 * TiSLY Security — 遠隔防犯ルール設定パネル
 * RP2350（板橋自宅）と /api/home/v1/security/config 連動
 */

const HOME_API = "/api/home/v1";
const DEFAULT_HOME_SITE = "HOME-JP-ITABASHI-LIVE";

/** 3D Security 物件 → HOME API 実機 */
const SF_HOME_SITE_MAP = {
  "SEC-JP-MORIYA-001": DEFAULT_HOME_SITE,
  "SEC-JP-TSUKUBA-001": "HOME-JP-TSUKUBA-001",
};

const state = {
  homeSiteId: DEFAULT_HOME_SITE,
  guardMode: "night_only",
  paused: false,
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

function renderNotifyPolicy(notifyPolicy) {
  if (!notifyPolicy?.rows?.length) return;
  const hint = $("sf-notify-policy-hint");
  if (hint) {
    hint.textContent = `DI1 検知後 ${notifyPolicy.perimeterTimeoutSec ?? 120} 秒以内の DI2 で段階侵入`;
  }
  const list = $("sf-notify-policy");
  if (!list) return;
  for (const row of notifyPolicy.rows) {
    const li = list.querySelector(`[data-notify-id="${row.id}"]`);
    if (!li) continue;
    const badge = li.querySelector(".sf-notify-badge");
    const text = li.querySelector(".sf-notify-text");
    if (text) text.textContent = row.label;
    if (badge) {
      if (row.severity === "critical") {
        badge.textContent = "緊急";
        badge.className = "sf-notify-badge is-critical";
      } else if (row.enabled) {
        badge.textContent = "ON";
        badge.className = "sf-notify-badge is-on";
      } else {
        badge.textContent = "OFF";
        badge.className = "sf-notify-badge is-off";
      }
    }
    li.classList.toggle("is-on", row.id === "di1_alone");
    li.classList.toggle("is-critical", row.id === "staged_intrusion");
    li.classList.toggle("is-off", row.id === "di2_alone");
  }
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

  const di1Dur = $("sf-di1-duration");
  if (di1Dur) {
    di1Dur.value = String(rules.di1DurationSec ?? 45);
    setText("sf-di1-duration-val", di1Dur.value);
  }
  setSegValue("sf-di1-24v-seg", rules.di1LightMode || "steady");

  const peri = $("sf-perimeter-timeout");
  if (peri) {
    peri.value = String(rules.perimeterTimeoutSec ?? 120);
    setText("sf-perimeter-timeout-val", peri.value);
  }
  setSegValue("sf-di2-24v-seg", rules.di2LightMode || "fast_blink");
  setSegValue("sf-di2-100v-seg", rules.di2Light100vMode || "steady");

  const di2Alert = $("sf-di2-alert-duration");
  if (di2Alert) {
    di2Alert.value = String(rules.di2AlertDurationSec ?? 45);
    setText("sf-di2-alert-duration-val", di2Alert.value);
  }

  const di2solo = $("sf-di2solo-duration");
  if (di2solo) {
    di2solo.value = String(
      rules.di2StandaloneDurationSec ?? rules.di2AlertDurationSec ?? 45
    );
    setText("sf-di2solo-duration-val", di2solo.value);
  }
  setSegValue(
    "sf-di2solo-24v-seg",
    rules.di2Standalone24vMode || "steady"
  );
  setSegValue(
    "sf-di2solo-100v-seg",
    rules.di2Standalone100vMode || "steady"
  );
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
  const payload = {
    siteId: homeSiteId,
    actor: "security-v1",
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

async function applyToDevice(homeSiteId) {
  const payload = collectPayload(homeSiteId);
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

function bindRemoteConfigUi() {
  if (window.__TISLY_SF_REMOTE_BOUND) return;
  window.__TISLY_SF_REMOTE_BOUND = true;

  bindSlider("sf-di1-duration", "sf-di1-duration-val");
  bindSlider("sf-perimeter-timeout", "sf-perimeter-timeout-val");
  bindSlider("sf-di2-alert-duration", "sf-di2-alert-duration-val");
  bindSlider("sf-di2solo-duration", "sf-di2solo-duration-val");

  bindSegGroup("sf-guard-seg", (value) => {
    if (value !== "paused") state.guardMode = value;
  });
  bindSegGroup("sf-di1-24v-seg");
  bindSegGroup("sf-di2-24v-seg");
  bindSegGroup("sf-di2-100v-seg");
  bindSegGroup("sf-di2solo-24v-seg");
  bindSegGroup("sf-di2solo-100v-seg");

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

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
  "SEC-JP-TOYOSHIMA-001": "HOME-JP-TOYOSHIMA",
  "SEC-JP-TOSHIMA-001": "HOME-JP-TOYOSHIMA",
  "HOME-JP-TOYOSHIMA": "HOME-JP-TOYOSHIMA",
  TOYOSHIMA001: "HOME-JP-TOYOSHIMA",
  TOSHIMA001: "HOME-JP-TOYOSHIMA",
  toyoshima: "HOME-JP-TOYOSHIMA",
  "HOME-JP-ITABASHI-LIVE": DEFAULT_HOME_SITE,
  TOMS001: DEFAULT_HOME_SITE,
  HOME001: DEFAULT_HOME_SITE,
  itabashi: DEFAULT_HOME_SITE,
};

/** 実機ラベル（内部 ID 非表示） */
const SF_HOME_SITE_LABEL = {
  "HOME-JP-ITABASHI-LIVE": "板橋自宅",
  "HOME-JP-TOYOSHIMA": "豊島邸",
  "HOME-JP-TSUKUBA-001": "つくばモデルハウス",
};

/** Web Push 条件トグル：緊急 → サイレント → OFF → 緊急… */
const NOTIFY_MODE_CYCLE = ["critical", "silent", "off"];

const NOTIFY_ID_TO_FIELD = {
  di1_alone: "notifyDi1Mode",
  staged_intrusion: "notifyStagedMode",
  di2_alone: "notifyDi2Mode",
  main_beam_far: "notifyMainFarMode",
  main_beam_near: "notifyMainNearMode",
  detached_road: "notifyDi1Mode",
  detached_path: "notifyDi2Mode",
};

const NOTIFY_PROFILES_V1 = {
  itabashi: [
    { id: "di1_alone", field: "notifyDi1Mode", title: "駐車場センサー (DI1)" },
    { id: "staged_intrusion", field: "notifyStagedMode", title: "段階侵入 (DI1→DI2)" },
    { id: "di2_alone", field: "notifyDi2Mode", title: "ガレージセンサー (DI2)" },
  ],
  toyoshima: [
    { id: "main_beam_far", field: "notifyMainFarMode", title: "外周ビーム（母屋・遠）" },
    { id: "main_beam_near", field: "notifyMainNearMode", title: "建物至近ビーム（母屋・近）" },
    { id: "detached_road", field: "notifyDi1Mode", title: "道路側センサー（はなれ）" },
    { id: "detached_path", field: "notifyDi2Mode", title: "通路側センサー（はなれ）" },
  ],
};

const DEBOUNCE_LABELS_V1 = {
  itabashi: {
    confirm: "共通デバウンス",
    di1: "駐車場センサー (DI1)",
    di2: "ガレージセンサー (DI2)",
    beam: "外周ビーム（共用）",
  },
  toyoshima: {
    confirm: "共通デバウンス",
    di1: "外周ビーム（母屋・遠）",
    di2: "建物至近ビーム（母屋・近）",
    beam: "はなれセンサー",
  },
};

const state = {
  homeSiteId: DEFAULT_HOME_SITE,
  guardMode: "always",
  scheduleStart: "18:00",
  scheduleEnd: "06:00",
  paused: false,
  notifyModes: {
    notifyDi1Mode: "silent",
    notifyStagedMode: "critical",
    notifyDi2Mode: "critical",
    notifyMainFarMode: "critical",
    notifyMainNearMode: "critical",
  },
};

function isToyoshimaHomeSite(homeSiteId) {
  return resolveHomeSiteId(homeSiteId) === "HOME-JP-TOYOSHIMA";
}

function currentTuningProfile() {
  return isToyoshimaHomeSite(state.homeSiteId) ? "toyoshima" : "itabashi";
}

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
  if (!id) return DEFAULT_HOME_SITE;
  if (SF_HOME_SITE_MAP[id]) return SF_HOME_SITE_MAP[id];
  const upper = id.toUpperCase();
  // 豊島邸の別名は板橋デフォルトへ
  // フォールバックさせない
  if (upper.includes("TOYOSHIMA") || upper.includes("TOSHIMA")) {
    return "HOME-JP-TOYOSHIMA";
  }
  if (
    upper.includes("ITABASHI") ||
    upper === "TOMS001" ||
    upper === "HOME001"
  ) {
    return DEFAULT_HOME_SITE;
  }
  if (id.startsWith("HOME-JP-")) return id;
  return DEFAULT_HOME_SITE;
}

/**
 * OTA API 用スラッグ（toyoshima / itabashi）
 * ヘッダー選択 ID を動的に解決する
 */
export function resolveOtaSiteSlugV1(rawId) {
  const id = String(rawId || "").trim();
  const home = resolveHomeSiteId(id);
  const hay = `${id} ${home}`.toUpperCase();
  if (hay.includes("TOYOSHIMA") || hay.includes("TOSHIMA")) {
    return "toyoshima";
  }
  return "itabashi";
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

function notifyTitleFor(id) {
  const row = (NOTIFY_PROFILES_V1[currentTuningProfile()] || []).find(
    (r) => r.id === id
  );
  if (row?.title) return row.title;
  if (id === "di1_alone") return "駐車場センサー (DI1)";
  if (id === "staged_intrusion") return "段階侵入 (DI1→DI2)";
  if (id === "di2_alone") return "ガレージセンサー (DI2)";
  return id;
}

function notifyLabelFor(id, mode) {
  const m = normalizeNotifyMode(mode);
  const title = notifyTitleFor(id);
  if (m === "critical") return `${title}：緊急通知ON`;
  if (m === "silent") return `${title}：サイレント`;
  return `${title}：OFF`;
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

function applyDebounceLabelsV1() {
  const labels = DEBOUNCE_LABELS_V1[currentTuningProfile()];
  const pairs = [
    ["sf-di-confirm-ms", labels.confirm],
    ["sf-debounce-di1-ms", labels.di1],
    ["sf-debounce-di2-ms", labels.di2],
    ["sf-debounce-beam-ms", labels.beam],
  ];
  for (const [id, prefix] of pairs) {
    const label = document.querySelector(`label[for="${id}"]`);
    const strong = $(`${id}-val`);
    if (!label || !strong) continue;
    label.innerHTML = `${prefix} <strong id="${id}-val">${strong.textContent || "100"}</strong>ms`;
  }
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
  if (rules?.notifyMainFarMode) {
    state.notifyModes.notifyMainFarMode = normalizeNotifyMode(
      rules.notifyMainFarMode
    );
  }
  if (rules?.notifyMainNearMode) {
    state.notifyModes.notifyMainNearMode = normalizeNotifyMode(
      rules.notifyMainNearMode
    );
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
  const hint = $("sf-notify-policy-hint");
  const profile = currentTuningProfile();
  if (hint) {
    hint.textContent =
      profile === "toyoshima"
        ? "豊島邸：センサーごとに緊急 / サイレント / OFF（タップで切替・即時保存）"
        : notifyPolicy?.perimeterTimeoutSec != null
          ? `駐車場センサー検知後 ${notifyPolicy.perimeterTimeoutSec} 秒以内のガレージセンサーで段階侵入（タップで緊急/サイレント/OFF切替）`
          : "タップで 緊急 → サイレント → OFF（即時保存）";
  }
  const list = $("sf-notify-policy");
  if (!list) return;
  const rows = NOTIFY_PROFILES_V1[profile] || NOTIFY_PROFILES_V1.itabashi;
  list.innerHTML = rows
    .map((row) => {
      const mode = normalizeNotifyMode(state.notifyModes[row.field] || "critical");
      const badge =
        mode === "critical" ? "緊急" : mode === "silent" ? "サイレント" : "OFF";
      const cls =
        mode === "critical"
          ? "is-critical"
          : mode === "silent"
            ? "is-silent"
            : "is-off";
      return `<li
        class="sf-notify-policy-item ${cls}"
        data-notify-id="${row.id}"
        data-notify-mode="${mode}"
        role="button"
        tabindex="0"
        aria-pressed="${mode === "critical" ? "true" : "false"}"
        title="タップで 緊急 → サイレント → OFF"
      >
        <span class="sf-notify-badge ${cls}">${badge}</span>
        <span class="sf-notify-text">${notifyLabelFor(row.id, mode)}</span>
      </li>`;
    })
    .join("");
}

function cycleNotifyRow(li) {
  const id = li?.dataset?.notifyId;
  const field = NOTIFY_ID_TO_FIELD[id];
  if (!field) return;
  const next = nextNotifyMode(state.notifyModes[field] || li.dataset.notifyMode);
  state.notifyModes[field] = next;
  applyNotifyRowUi(li, next);
  scheduleNotifySync();
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

function normalizeGuardModeUi(mode) {
  if (mode === "off") return "off";
  /* scheduled / night_only は 24h 警戒へ正規化 */
  return "always";
}

function normalizeTimeHm(value, fallback) {
  const raw = String(value || "").trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function syncSchedulePanelVisibility(_mode) {
  const panel = $("sf-light-schedule-panel");
  if (!panel) return;
  panel.hidden = false;
}

function readScheduleTimes() {
  return {
    scheduleStart: normalizeTimeHm(
      $("sf-schedule-start")?.value,
      state.scheduleStart || "18:00"
    ),
    scheduleEnd: normalizeTimeHm(
      $("sf-schedule-end")?.value,
      state.scheduleEnd || "06:00"
    ),
  };
}

function writeScheduleTimes(start, end) {
  const s = normalizeTimeHm(start, "18:00");
  const e = normalizeTimeHm(end, "06:00");
  state.scheduleStart = s;
  state.scheduleEnd = e;
  const startEl = $("sf-schedule-start");
  const endEl = $("sf-schedule-end");
  if (startEl) startEl.value = s;
  if (endEl) endEl.value = e;
  syncScheduleWindowHint(s, e);
  try {
    window.TislySecurityTimeRangeV1?.paintDayNightTiles?.(
      "sf-op-daynight",
      "sf-schedule-start",
      "sf-schedule-end"
    );
  } catch {
    /* 装飾のみ */
  }
}

/** 日またぎ判定の現在ステータスを表示 */
function syncScheduleWindowHint(start, end) {
  const hint = $("sf-schedule-window-hint");
  if (!hint) return;
  const api = window.TislySecurityTimeRangeV1;
  const s = normalizeTimeHm(start, state.scheduleStart || "18:00");
  const e = normalizeTimeHm(end, state.scheduleEnd || "06:00");
  const overnight =
    (() => {
      const [sh, sm] = s.split(":").map(Number);
      const [eh, em] = e.split(":").map(Number);
      return sh * 60 + sm > eh * 60 + em;
    })();
  let active = true;
  if (api && typeof api.isWithinTimeRange === "function") {
    active = api.isWithinTimeRange(s, e, new Date());
  }
  const modeLabel = overnight ? "日またぎ" : "同日内";
  const activeLabel = active ? "現在は点灯時間帯内" : "現在は点灯時間帯外";
  hint.textContent = `${modeLabel}（${s}〜${e}）· ${activeLabel}`;
}

function renderRules(rules, notifyPolicy) {
  if (!rules) return;
  state.guardMode = normalizeGuardModeUi(rules.guardMode || "always");
  state.paused = Boolean(
    rules.securityPausedUntil &&
      Date.parse(rules.securityPausedUntil) > Date.now()
  );
  writeScheduleTimes(
    rules.scheduleStart || "18:00",
    rules.scheduleEnd || "06:00"
  );

  if (state.paused || state.guardMode === "off") {
    setSegValue("sf-guard-seg", "off");
  } else {
    setSegValue("sf-guard-seg", "always");
  }
  syncSchedulePanelVisibility();

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

  const debounceFields = [
    ["sf-di-confirm-ms", "sf-di-confirm-ms-val", rules.diConfirmMs ?? 100],
    ["sf-debounce-di1-ms", "sf-debounce-di1-ms-val", rules.debounceDi1Ms ?? rules.diConfirmMs ?? 100],
    ["sf-debounce-di2-ms", "sf-debounce-di2-ms-val", rules.debounceDi2Ms ?? rules.diConfirmMs ?? 100],
    ["sf-debounce-beam-ms", "sf-debounce-beam-ms-val", rules.debounceBeamMs ?? rules.diConfirmMs ?? 100],
  ];
  for (const [sliderId, labelId, val] of debounceFields) {
    const slider = $(sliderId);
    if (slider) slider.value = String(val);
    setText(labelId, String(val));
  }

  syncNotifyModesFromRules(rules, notifyPolicy);
  applyDebounceLabelsV1();
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
  const guardSeg = normalizeGuardModeUi(readSegValue("sf-guard-seg"));
  const times = readScheduleTimes();
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
    notifyMainFarMode: normalizeNotifyMode(state.notifyModes.notifyMainFarMode),
    notifyMainNearMode: normalizeNotifyMode(
      state.notifyModes.notifyMainNearMode
    ),
    notifyDi1SilentLogOnly: notifyDi1Mode !== "critical",
    notifyDi2InstantPush: notifyDi2Mode === "critical",
    scheduleStart: times.scheduleStart,
    scheduleEnd: times.scheduleEnd,
    guardMode: guardSeg === "off" ? "off" : "always",
    securityPausedUntil: null,
    diConfirmMs: readSlider("sf-di-confirm-ms", 100),
    debounceDi1Ms: readSlider("sf-debounce-di1-ms", 100),
    debounceDi2Ms: readSlider("sf-debounce-di2-ms", 100),
    debounceBeamMs: readSlider("sf-debounce-beam-ms", 100),
  };
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
  const mode = normalizeGuardModeUi(value);
  const times = readScheduleTimes();
  const payload = {
    siteId: homeSiteId,
    actor: "security-v1",
    guardMode: mode,
    securityPausedUntil: null,
    scheduleStart: times.scheduleStart,
    scheduleEnd: times.scheduleEnd,
  };
  state.guardMode = mode;
  state.paused = mode === "off";
  setSegValue("sf-guard-seg", mode);
  syncSchedulePanelVisibility(mode);
  const data = await postSecurityConfig(homeSiteId, payload);
  const label =
    mode === "off"
      ? "警戒一時解除"
      : "24時間警戒";
  showToast(`${label} を反映しました`);
  return data;
}

/** ライト点灯時間帯の変更を即時保存 */
async function applyScheduleTimesImmediate() {
  const times = readScheduleTimes();
  writeScheduleTimes(times.scheduleStart, times.scheduleEnd);
  const guardSeg = normalizeGuardModeUi(readSegValue("sf-guard-seg"));
  const payload = {
    siteId: state.homeSiteId,
    actor: "security-v1",
    guardMode: guardSeg === "off" ? "off" : "always",
    securityPausedUntil: null,
    scheduleStart: times.scheduleStart,
    scheduleEnd: times.scheduleEnd,
  };
  const data = await postSecurityConfig(state.homeSiteId, payload);
  showToast(
    `ライト点灯時間帯 ${times.scheduleStart}〜${times.scheduleEnd} を保存しました`
  );
  return data;
}

function updateTargetLabel(homeSiteId) {
  const label = SF_HOME_SITE_LABEL[homeSiteId] || "選択中の物件";
  setText("sf-remote-target", `実機: ${label} · 感応度/通知条件`);
  state.homeSiteId = homeSiteId;
  applyDebounceLabelsV1();
  /* 取得前でも物件別の通知行を即描画 */
  renderNotifyPolicy(null);
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

let debounceSaveTimer = null;
let notifySaveTimer = null;

function scheduleNotifySync() {
  clearTimeout(notifySaveTimer);
  notifySaveTimer = setTimeout(() => {
    applyToDevice(state.homeSiteId)
      .then((data) => {
        showToast(data.message || "通知条件を実機へ反映しました");
      })
      .catch((err) => {
        showToast(err.message || "通知条件の反映に失敗しました");
      });
  }, 250);
}

function scheduleDebounceSync() {
  clearTimeout(debounceSaveTimer);
  debounceSaveTimer = setTimeout(() => {
    applyToDevice(state.homeSiteId)
      .then((data) => {
        showToast(data.message || "感応度設定を実機へ反映しました");
      })
      .catch((err) => {
        showToast(err.message || "感応度の反映に失敗しました");
      });
  }, 600);
}

function bindRemoteConfigUi() {
  if (window.__TISLY_SF_REMOTE_BOUND) return;
  window.__TISLY_SF_REMOTE_BOUND = true;

  bindSlider("sf-lighting-duration", "sf-lighting-duration-val");
  bindSlider("sf-di1-duration", "sf-di1-duration-val");
  bindSlider("sf-perimeter-timeout", "sf-perimeter-timeout-val");
  bindSlider("sf-di2-alert-duration", "sf-di2-alert-duration-val");
  bindSlider("sf-di2solo-duration", "sf-di2solo-duration-val");
  bindSlider("sf-di-confirm-ms", "sf-di-confirm-ms-val");
  bindSlider("sf-debounce-di1-ms", "sf-debounce-di1-ms-val");
  bindSlider("sf-debounce-di2-ms", "sf-debounce-di2-ms-val");
  bindSlider("sf-debounce-beam-ms", "sf-debounce-beam-ms-val");

  for (const id of [
    "sf-di-confirm-ms",
    "sf-debounce-di1-ms",
    "sf-debounce-di2-ms",
    "sf-debounce-beam-ms",
  ]) {
    $(id)?.addEventListener("input", () => scheduleDebounceSync());
  }

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

  let scheduleDebounce = null;
  const onScheduleChange = () => {
    clearTimeout(scheduleDebounce);
    scheduleDebounce = setTimeout(() => {
      applyScheduleTimesImmediate().catch((err) => {
        showToast(err.message || "時間指定の保存に失敗しました");
      });
    }, 400);
  };
  $("sf-schedule-start")?.addEventListener("change", onScheduleChange);
  $("sf-schedule-end")?.addEventListener("change", onScheduleChange);
  syncSchedulePanelVisibility();

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

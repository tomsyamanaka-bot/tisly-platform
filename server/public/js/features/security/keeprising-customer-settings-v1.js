/**
 * Keep Rising の画面を豊島邸のカードに揃える。
 * 端子と段階連動だけ、この現場の仕様。
 * 点灯の保存は決定ボタンまで待つ。
 * cache ?t=2607
 */

import { showViewportToast } from "./toast-viewport-v1.js";

const SITE_ID = "SEC-JP-KEEPRISING-001";
const API = "/api/home/v1/keeprising";
const DURATION_PRESETS = [5, 15, 45, 90, 120];
const WINDOW_PRESETS = [30, 60, 90, 120];
const OFFSETS = [-30, -15, 0, 15, 30];

const BEAM_MODES = [
  {
    id: "staged_steady",
    label: "段階連動（標準点灯）",
    desc: "DI1でパトライト(DO1)、DI2で投光器1・2(DO2・3)点灯＋パトライト、DI2後60秒以内のDI3で事務所ライト(DO4)も全点灯（DI3単独は投光器1・2のみ指定秒点灯）",
  },
  {
    id: "staged_blink",
    label: "段階連動（威嚇点滅）",
    desc: "上記ロジックで投光器1・2を点滅作動",
  },
  {
    id: "full",
    label: "すぐ全警戒（即時フル作動）",
    desc: "どのビーム反応でもパトライト・投光器・事務所ライトを即時全作動",
  },
  {
    id: "notify",
    label: "通知のみ",
    desc: "昼夜ともライト・パトライトは動かさずスマホ通知のみ",
  },
];

const NOTIFY_ROWS = [
  { key: "notifyDi1", label: "ビームセンサー1（外周）検知" },
  { key: "notifyDi2", label: "ビームセンサー2（中間）検知" },
  { key: "notifyDi3", label: "ビームセンサー3（事務所前）検知" },
];

export function isKeepRisingSecuritySite(siteId) {
  const id = String(siteId || "");
  return id === SITE_ID || id.includes("KEEPRISING");
}

export function keepRisingGuardLabel(mode) {
  if (mode === "home") return "通知のみ";
  if (mode === "disarmed") return "警戒 OFF";
  return "警戒 ON";
}

/** 警戒 ON / OFF。home は ON 表示のまま残す */
export function renderKeepRisingGuardModes(mode) {
  const current = mode === "disarmed" ? "disarmed" : "away";
  const items = [
    { id: "away", emoji: "🛡️", label: "警戒 ON", cls: "ts-mode-seg-on" },
    { id: "disarmed", emoji: "⏸️", label: "警戒 OFF", cls: "ts-mode-seg-off" },
  ];
  return items
    .map((item) => {
      const on = item.id === current;
      return `<button type="button" class="ts-mode-seg ${item.cls}${on ? " is-on" : ""}" data-mode="${item.id}" role="radio" aria-checked="${on ? "true" : "false"}"><span class="ts-mode-seg-emoji" aria-hidden="true">${item.emoji}</span><span class="ts-mode-seg-label">${item.label}</span></button>`;
    })
    .join("");
}

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token =
    sessionStorage.getItem("tisly_token") ||
    localStorage.getItem("tisly_admin_token") ||
    "";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function snapKeepRisingDurationSec(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 45;
  let best = DURATION_PRESETS[0];
  let dist = Math.abs(n - best);
  for (const preset of DURATION_PRESETS) {
    const gap = Math.abs(n - preset);
    if (gap <= dist) {
      best = preset;
      dist = gap;
    }
  }
  return best;
}

function beamModeId(raw) {
  const id = String(raw || "");
  return BEAM_MODES.some((row) => row.id === id) ? id : "staged_steady";
}

function beamModeLabel(raw) {
  const id = beamModeId(raw);
  return BEAM_MODES.find((row) => row.id === id)?.label || "段階連動（標準点灯）";
}

function windowSec(raw) {
  const n = Number(raw);
  if (WINDOW_PRESETS.includes(n)) return n;
  return 60;
}

function offsetMin(raw, fallback) {
  const n = Number(raw);
  return OFFSETS.includes(n) ? n : fallback;
}

function hm(raw, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw || ""));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function readJson(url, options) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: authHeaders(),
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "通信に失敗しました");
  }
  return data;
}

async function readSettings() {
  const data = await readJson(
    `${API}/settings?siteId=${SITE_ID}&t=${Date.now()}&_fresh=${Date.now()}`
  );
  return data.settings;
}

async function readStatus() {
  return readJson(`${API}/status?t=${Date.now()}&_fresh=${Date.now()}`);
}

async function saveSettings(patch) {
  const data = await readJson(`${API}/settings`, {
    method: "PUT",
    body: JSON.stringify({ siteId: SITE_ID, ...patch }),
  });
  return data.settings;
}

async function postManual(action) {
  return readJson(`${API}/manual`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

async function postGuard(mode) {
  await readJson("/api/security-floor/v1/guard-mode", {
    method: "POST",
    body: JSON.stringify({ siteId: SITE_ID, mode }),
  });
}

function durationButtons(sec) {
  const selected = snapKeepRisingDurationSec(sec);
  return DURATION_PRESETS.map((preset) => {
    const on = preset === selected;
    return `<button type="button" class="kr-preset${on ? " is-on" : ""}" data-kr-sec="${preset}" aria-pressed="${on ? "true" : "false"}">${preset}秒</button>`;
  }).join("");
}

function windowButtons(sec) {
  const selected = windowSec(sec);
  return WINDOW_PRESETS.map((preset) => {
    const on = preset === selected;
    return `<button type="button" class="kr-preset${on ? " is-on" : ""}" data-kr-window="${preset}" aria-pressed="${on ? "true" : "false"}">${preset}秒</button>`;
  }).join("");
}

function beamModeButtons(current) {
  const selected = beamModeId(current);
  return BEAM_MODES.map((row) => {
    const on = row.id === selected;
    return `<button type="button" class="ts-seg-btn${on ? " is-on" : ""}" data-kr-beam="${row.id}" aria-pressed="${on ? "true" : "false"}"><span class="ts-seg-label">${row.label}</span><span class="ts-seg-desc">${row.desc}</span></button>`;
  }).join("");
}

function offsetOptions(current, fallback) {
  const selected = offsetMin(current, fallback);
  return OFFSETS.map((n) => {
    const sign = n > 0 ? "+" : "";
    const on = n === selected ? " selected" : "";
    return `<option value="${n}"${on}>${sign}${n}分</option>`;
  }).join("");
}

function switchRow(id, label, on) {
  return `<label class="ts-switch-row" for="${id}"><span class="ts-label">${label}</span><span class="ts-switch"><input type="checkbox" id="${id}" data-kr-toggle="${id}" ${on ? "checked" : ""} /><span class="ts-switch-ui" aria-hidden="true"></span><span class="ts-switch-text" data-kr-toggle-label="${id}">${on ? "ON" : "OFF"}</span></span></label>`;
}

function notifyRows(settings) {
  return NOTIFY_ROWS.map((row) => {
    const on = settings?.[row.key] !== false;
    return `<div class="ts-notify-row ts-customer-notify-row"><span class="ts-label">${row.label}</span><div class="ts-notify-btns"><button type="button" class="ts-notify-btn${on ? " is-on" : ""}" data-kr-notify="${row.key}" data-kr-notify-on="1" aria-pressed="${on ? "true" : "false"}">🔔 通知ON</button><button type="button" class="ts-notify-btn${on ? "" : " is-on"}" data-kr-notify="${row.key}" data-kr-notify-on="0" aria-pressed="${on ? "false" : "true"}">🔕 通知オフ</button></div></div>`;
  }).join("");
}

function outputLine(status) {
  const by = {};
  for (const row of status?.outputs || []) by[row.ch] = row.on ? "ON" : "OFF";
  const bit = (ch) => by[ch] || "OFF";
  return `投光器1 ${bit(2)}・投光器2 ${bit(3)}・事務所ライト ${bit(4)}・パトライト ${bit(1)}`;
}

function guardButtons(mode) {
  const current = mode === "disarmed" ? "disarmed" : "away";
  const items = [
    { id: "away", emoji: "🛡️", label: "警戒 ON", cls: "ts-mode-seg-on" },
    { id: "disarmed", emoji: "⏸️", label: "警戒 OFF", cls: "ts-mode-seg-off" },
  ];
  return items
    .map((item) => {
      const on = item.id === current;
      return `<button type="button" class="ts-mode-seg ${item.cls}${on ? " is-on" : ""}" data-kr-guard="${item.id}" role="radio" aria-checked="${on ? "true" : "false"}"><span class="ts-mode-seg-emoji" aria-hidden="true">${item.emoji}</span><span class="ts-mode-seg-label">${item.label}</span></button>`;
    })
    .join("");
}

function render(root, settings, status) {
  const stored = settings || {};
  const astro = stored.lightingScheduleMode === "astronomical";
  const manualStart = hm(stored.scheduleStart, "20:00");
  const manualEnd = hm(stored.scheduleEnd, "06:00");
  const activeStart = hm(status?.scheduleLabel?.split("〜")[0], manualStart);
  const activeEnd = hm(
    String(status?.scheduleLabel || "").split("〜")[1],
    manualEnd
  );
  const start = astro ? activeStart : manualStart;
  const end = astro ? activeEnd : manualEnd;
  const night = Boolean(status?.nightNow);
  const alerting = (status?.inputs || []).some((row) => row.active);
  const month = Number(status?.monthAlerts || 0);
  const lightLabel = status?.scheduleLabel || `${manualStart}〜${manualEnd}`;
  const assure = document.getElementById("sf-customer-assure-card")
    ? ""
    : `<section class="ts-card ts-assure-health-card" aria-label="システム安心ステータス"><div class="ts-assure-head-row"><h3 class="ts-card-head ts-assure-head">🛡 システム安心ステータス</h3><button type="button" class="ts-refresh-btn" data-kr-refresh>🔄 最新状態に更新</button></div><p class="ts-assure-note">TOMS が常時遠隔監視しています</p></section>`;
  root.dataset.manualStart = manualStart;
  root.dataset.manualEnd = manualEnd;
  root.dataset.guard = stored.guardMode || "away";
  root.dataset.guardTouched = "";
  root.innerHTML = `
    ${assure}
    <section class="ts-card ts-safety-card ${alerting ? "is-alert" : "is-ok"}" data-kr-safety>
      <div class="ts-safety-main">
        <span class="ts-status-emoji" aria-hidden="true">${alerting ? "🚨" : "✅"}</span>
        <div class="ts-status-copy">
          <p class="ts-status-head" data-kr-safety-head>${alerting ? "発報があります" : "安全確認：異常なし"}</p>
          <p class="ts-status-sub">すべてのセンサーが正常に動作しています</p>
        </div>
      </div>
      <div class="ts-safety-metrics" aria-label="稼働サマリー">
        <div class="ts-safety-metric">
          <span class="ts-safety-metric-key">今月の発報件数</span>
          <strong class="ts-safety-metric-val" data-kr-month>${month}件</strong>
        </div>
        <div class="ts-safety-metric">
          <span class="ts-safety-metric-key">自動点灯時間帯</span>
          <strong class="ts-safety-metric-val" data-kr-light>${lightLabel}</strong>
        </div>
      </div>
    </section>
    <section class="ts-card ts-mode-card" aria-label="警戒モード">
      <h3 class="ts-card-head">🛡️ 警戒モード</h3>
      <div class="ts-mode-segment ts-mode-segment-2" role="radiogroup" aria-label="警戒モード切替">
        ${guardButtons(stored.guardMode)}
      </div>
    </section>
    <section class="ts-card ts-daily-settings">
      <h3 class="ts-card-head">⚙️ 防犯・照明・通知の詳細設定</h3>
      <div class="ts-daily-body">
        <section class="ts-daily-block">
          <h4 class="ts-daily-h">① 警戒モード別 アクション詳細設定</h4>
          <p class="ts-hint">段階ビーム連動モード</p>
          <p class="ts-label">💡 ライト点灯維持時間</p>
          <div class="kr-presets" data-kr-duration-group>${durationButtons(stored.durationSec)}</div>
          <div class="ts-seg-row" role="radiogroup" aria-label="段階ビーム連動モード">${beamModeButtons(stored.beamLinkMode)}</div>
          <p class="ts-hint">連続侵入の判定秒数。DI2からこの秒以内のDI3だけ事務所ライトを足します。</p>
          <div class="kr-presets" data-kr-window-group>${windowButtons(stored.stageWindowSec)}</div>
          ${switchRow("kr-patlite-threat", "パトライト威嚇連動", stored.patliteThreatEnabled !== false)}
          ${switchRow("kr-daytime-relay", "昼間でもセンサー連動リレー（テスト）", Boolean(stored.daytimeRelayTest))}
        </section>
        <section class="ts-daily-block">
          <h4 class="ts-daily-h">② 昼夜のスマート点灯制御</h4>
          <p class="ts-hint">夜間のライト自動点灯時間帯（日跨ぎ可）</p>
          <div class="ts-daynight" data-kr-daynight="${night ? "night" : "day"}">
            <div class="ts-dn-tile ts-dn-day${night ? "" : " is-now"}">
              <span class="ts-dn-ico" aria-hidden="true"><span class="ts-dn-emoji">☀️</span></span>
              <span class="ts-dn-head">日中（通知のみ）</span>
              <span class="ts-dn-desc">${stored.daytimeRelayTest ? "通知＋テスト点灯（昼間連動ON）" : "通知のみ・ライトは消灯のまま"}</span>
              <span class="ts-dn-now">いま</span>
            </div>
            <div class="ts-dn-tile ts-dn-night${night ? " is-now" : ""}">
              <span class="ts-dn-ico" aria-hidden="true"><span class="ts-dn-emoji">🌙</span></span>
              <span class="ts-dn-head">夜間（ライト点灯＋通知）</span>
              <span class="ts-dn-desc">ライト点灯＋通知</span>
              <span class="ts-dn-now">いま</span>
            </div>
          </div>
          <div class="ts-schedule-inline">
            <label class="ts-schedule-field" for="kr-schedule-start"><span>開始時刻</span><input type="time" id="kr-schedule-start" data-kr="start" value="${start}"${astro ? " disabled" : ""} /></label>
            <label class="ts-schedule-field" for="kr-schedule-end"><span>終了時刻</span><input type="time" id="kr-schedule-end" data-kr="end" value="${end}"${astro ? " disabled" : ""} /></label>
          </div>
          <div class="sf-astro">
            <div class="sf-astro-modes">
              <button type="button" class="sf-astro-mode${astro ? "" : " is-on"}" data-kr-astro="manual">手動時間指定（例：20:00〜06:00）</button>
              <button type="button" class="sf-astro-mode${astro ? " is-on" : ""}" data-kr-astro="astronomical">🌅 日の出・日の入り自動追従（天文タイマー）</button>
            </div>
            <p class="sf-astro-label" data-kr-astro-label ${astro && status?.astroLabel ? "" : "hidden"}>${status?.astroLabel || ""}</p>
            <div class="sf-astro-offsets" data-kr-astro-offsets ${astro ? "" : "hidden"}>
              <label>日没オフセット<select data-kr-sunset aria-label="日没オフセット">${offsetOptions(stored.sunsetOffsetMin, -15)}</select></label>
              <label>日の出オフセット<select data-kr-sunrise aria-label="日の出オフセット">${offsetOptions(stored.sunriseOffsetMin, 15)}</select></label>
            </div>
          </div>
        </section>
        <section class="ts-daily-block">
          <h4 class="ts-daily-h">③ エリア別 通知条件設定</h4>
          <p class="ts-hint">センサーごとに通知の受け取りを切り替え</p>
          <p class="ts-dn-inline"><span class="ts-dn-chip ts-dn-chip-day">☀️ 日中 通知のみ</span><span class="ts-dn-chip ts-dn-chip-night">🌙 夜間 点灯＋通知</span></p>
          <div data-kr-notify-rows>${notifyRows(stored)}</div>
        </section>
        <section class="ts-daily-block">
          <h4 class="ts-daily-h">④ 防犯ライト・パトライト手動動作</h4>
          <p class="ts-hint">手動操作は確定を待たず、押した瞬間に実機へ届きます</p>
          <div class="ts-btn-row ts-manual-light-kicks">
            <button type="button" class="ts-btn ts-btn-on" data-kr-kick="flood1_on">💡 投光器1点灯</button>
            <button type="button" class="ts-btn ts-btn-on" data-kr-kick="flood2_on">💡 投光器2点灯</button>
            <button type="button" class="ts-btn ts-btn-on" data-kr-kick="office_on">💡 事務所ライト点灯</button>
            <button type="button" class="ts-btn ts-btn-on" data-kr-kick="bulk_on">💡 照明を一括ON</button>
            <button type="button" class="ts-btn ts-btn-off" data-kr-kick="bulk_off">💡 照明を一括OFF</button>
            <button type="button" class="ts-btn ts-btn-warn" data-kr-kick="patlite_test">⚡ パトライト威嚇テスト</button>
          </div>
          <p class="ts-hint" data-kr-output>${outputLine(status)}</p>
        </section>
        <p class="ts-hint" data-kr-note>変更は「設定変更を確定する（保存）」を押すまで反映されません</p>
        <button type="button" class="ts-btn ts-btn-primary ts-btn-wide" data-kr-commit>設定変更を確定する（保存）</button>
      </div>
    </section>
  `;
}

function draftFrom(root) {
  const beam = root.querySelector(".ts-seg-btn.is-on");
  const astro =
    root.querySelector("[data-kr-astro].is-on")?.getAttribute("data-kr-astro") ===
    "astronomical";
  const guardBtn = root.querySelector("[data-kr-guard].is-on");
  const guard = root.dataset.guardTouched
    ? guardBtn?.getAttribute("data-kr-guard") || "away"
    : root.dataset.guard || "away";
  const notify = {};
  for (const row of NOTIFY_ROWS) {
    const on = root.querySelector(
      `[data-kr-notify="${row.key}"][data-kr-notify-on="1"]`
    );
    notify[row.key] = Boolean(on?.classList.contains("is-on"));
  }
  return {
    scheduleStart: astro
      ? root.dataset.manualStart || "20:00"
      : hm(root.querySelector('[data-kr="start"]')?.value, "20:00"),
    scheduleEnd: astro
      ? root.dataset.manualEnd || "06:00"
      : hm(root.querySelector('[data-kr="end"]')?.value, "06:00"),
    durationSec: snapKeepRisingDurationSec(
      root.querySelector("[data-kr-sec].is-on")?.getAttribute("data-kr-sec")
    ),
    beamLinkMode: beamModeId(beam?.getAttribute("data-kr-beam")),
    stageWindowSec: windowSec(
      root.querySelector("[data-kr-window].is-on")?.getAttribute("data-kr-window")
    ),
    daytimeRelayTest: Boolean(
      root.querySelector("#kr-daytime-relay")?.checked
    ),
    patliteThreatEnabled: Boolean(
      root.querySelector("#kr-patlite-threat")?.checked
    ),
    lightingScheduleMode: astro ? "astronomical" : "manual",
    sunsetOffsetMin: offsetMin(
      root.querySelector("[data-kr-sunset]")?.value,
      -15
    ),
    sunriseOffsetMin: offsetMin(
      root.querySelector("[data-kr-sunrise]")?.value,
      15
    ),
    guardMode: guard === "disarmed" ? "disarmed" : guard === "home" ? "home" : "away",
    ...notify,
  };
}

function markDirty(root) {
  const line = root.querySelector("[data-kr-note]");
  if (line) {
    line.textContent = "未保存です。設定変更を確定する（保存）まで反映されません。";
  }
}

function paintGroup(button, attr) {
  const group = button.closest("[data-kr-duration-group], [data-kr-window-group]")
    || button.parentElement;
  group?.querySelectorAll(`[${attr}]`).forEach((btn) => {
    const on = btn === button;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function paintLive(root, status) {
  if (!status) return;
  const alerting = (status.inputs || []).some((row) => row.active);
  const card = root.querySelector("[data-kr-safety]");
  card?.classList.toggle("is-alert", alerting);
  card?.classList.toggle("is-ok", !alerting);
  const head = root.querySelector("[data-kr-safety-head]");
  if (head) head.textContent = alerting ? "発報があります" : "安全確認：異常なし";
  const month = root.querySelector("[data-kr-month]");
  if (month) month.textContent = `${Number(status.monthAlerts || 0)}件`;
  const light = root.querySelector("[data-kr-light]");
  if (light && status.scheduleLabel) light.textContent = status.scheduleLabel;
  const out = root.querySelector("[data-kr-output]");
  if (out) out.textContent = outputLine(status);
  const night = Boolean(status.nightNow);
  root.querySelector(".ts-dn-day")?.classList.toggle("is-now", !night);
  root.querySelector(".ts-dn-night")?.classList.toggle("is-now", night);
  const label = root.querySelector("[data-kr-astro-label]");
  if (label) {
    label.textContent = status.astroLabel || "";
    label.hidden = !status.astroLabel;
  }
}

function bind(root) {
  if (root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  root.addEventListener("input", () => {
    markDirty(root);
  });
  root.addEventListener("click", async (event) => {
    const preset = event.target.closest?.("[data-kr-sec]");
    if (preset) {
      paintGroup(preset, "data-kr-sec");
      markDirty(root);
      return;
    }
    const beam = event.target.closest?.("[data-kr-beam]");
    if (beam) {
      root.querySelectorAll("[data-kr-beam]").forEach((btn) => {
        const on = btn === beam;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      markDirty(root);
      return;
    }
    const windowBtn = event.target.closest?.("[data-kr-window]");
    if (windowBtn) {
      paintGroup(windowBtn, "data-kr-window");
      markDirty(root);
      return;
    }
    const astroBtn = event.target.closest?.("[data-kr-astro]");
    if (astroBtn) {
      const mode = astroBtn.getAttribute("data-kr-astro");
      root.querySelectorAll("[data-kr-astro]").forEach((btn) => {
        btn.classList.toggle("is-on", btn === astroBtn);
      });
      const on = mode === "astronomical";
      root.querySelector("[data-kr-astro-offsets]")?.toggleAttribute("hidden", !on);
      for (const input of root.querySelectorAll('[data-kr="start"], [data-kr="end"]')) {
        input.disabled = on;
      }
      markDirty(root);
      return;
    }
    const notifyBtn = event.target.closest?.("[data-kr-notify]");
    if (notifyBtn) {
      const key = notifyBtn.getAttribute("data-kr-notify");
      const turnOn = notifyBtn.getAttribute("data-kr-notify-on") === "1";
      root.querySelectorAll(`[data-kr-notify="${key}"]`).forEach((btn) => {
        const on = turnOn
          ? btn.getAttribute("data-kr-notify-on") === "1"
          : btn.getAttribute("data-kr-notify-on") === "0";
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      markDirty(root);
      return;
    }
    const guard = event.target.closest?.("[data-kr-guard]");
    if (guard) {
      const mode = guard.getAttribute("data-kr-guard") === "disarmed" ? "disarmed" : "away";
      root.dataset.guardTouched = "1";
      root.dataset.guard = mode;
      root.querySelectorAll("[data-kr-guard]").forEach((btn) => {
        const on = btn === guard;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
      guard.disabled = true;
      try {
        const saved = await saveSettings({ guardMode: mode });
        await postGuard(mode);
        root.dataset.guard = saved?.guardMode || mode;
        const header = document.getElementById("sf-guard-label");
        if (header) header.textContent = keepRisingGuardLabel(root.dataset.guard);
        showViewportToast(
          "kr-save-toast",
          "ts-toast",
          mode === "disarmed" ? "警戒 OFF にしました" : "警戒 ON にしました",
          2200
        );
      } catch (err) {
        showViewportToast("kr-save-toast", "ts-toast", err.message || "警戒モードを保存できません", 2800);
      } finally {
        guard.disabled = false;
      }
      return;
    }
    const kick = event.target.closest?.("[data-kr-kick]");
    if (kick) {
      const action = kick.getAttribute("data-kr-kick");
      kick.disabled = true;
      try {
        await postManual(action);
        const status = await readStatus();
        paintLive(root, status);
        showViewportToast("kr-save-toast", "ts-toast", "実機へ送りました", 1800);
      } catch (err) {
        showViewportToast("kr-save-toast", "ts-toast", err.message || "操作に失敗しました", 2800);
      } finally {
        kick.disabled = false;
      }
      return;
    }
    const refresh = event.target.closest?.("[data-kr-refresh]");
    if (refresh) {
      await reload(root);
      return;
    }
    const commit = event.target.closest?.("[data-kr-commit]");
    if (!commit) return;
    commit.disabled = true;
    try {
      const saved = await saveSettings(draftFrom(root));
      const status = await readStatus();
      render(root, saved, status);
      const line = root.querySelector("[data-kr-note]");
      if (line) {
        line.textContent = `設定変更を確定する（保存）が完了しました（${beamModeLabel(saved?.beamLinkMode)}）。`;
      }
      showViewportToast(
        "kr-save-toast",
        "ts-toast",
        `設定を保存しました（${beamModeLabel(saved?.beamLinkMode)}）`,
        2800
      );
    } catch (err) {
      const line = root.querySelector("[data-kr-note]");
      if (line) line.textContent = err.message || "保存に失敗しました";
    } finally {
      commit.disabled = false;
    }
  });
  root.addEventListener("change", (event) => {
    const box = event.target.closest?.("[data-kr-toggle]");
    if (box) {
      const label = root.querySelector(
        `[data-kr-toggle-label="${box.id}"]`
      );
      if (label) label.textContent = box.checked ? "ON" : "OFF";
    }
    markDirty(root);
  });
  const assure = document.getElementById("sf-customer-assure-refresh");
  if (assure && assure.dataset.krBound !== "1") {
    assure.dataset.krBound = "1";
    assure.addEventListener("click", () => {
      reload(root).catch(() => {});
    });
  }
  if (root.dataset.polling !== "1") {
    root.dataset.polling = "1";
    setInterval(() => {
      if (root.hidden) return;
      readStatus().then((status) => paintLive(root, status)).catch(() => {});
    }, 5000);
  }
}

async function reload(root) {
  const [settings, status] = await Promise.all([
    readSettings().catch(() => null),
    readStatus().catch(() => null),
  ]);
  render(root, settings, status);
}

export function mountKeepRisingSettings(siteId) {
  const existing = document.getElementById("kr-customer-settings");
  const show = isKeepRisingSecuritySite(siteId);
  if (!show) {
    if (existing) existing.hidden = true;
    return;
  }
  let root = existing;
  if (!root) {
    root = document.createElement("section");
    root.id = "kr-customer-settings";
    root.className = "kr-portal";
    const assure = document.getElementById("sf-customer-assure-card");
    if (assure) assure.insertAdjacentElement("afterend", root);
    else {
      const shell = document.querySelector(".sf-soc-shell");
      if (shell) shell.before(root);
      else document.body.appendChild(root);
    }
  }
  root.hidden = false;
  bind(root);
  if (root.dataset.ready === "1") return;
  root.dataset.ready = "1";
  reload(root).catch(() => {
    render(root, null, null);
    const line = root.querySelector("[data-kr-note]");
    if (line) line.textContent = "通信できないため、初期値を表示しています";
  });
}

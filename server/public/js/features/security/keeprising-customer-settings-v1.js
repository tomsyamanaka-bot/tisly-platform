/**
 * Keep Rising の稼働設定。
 * 点灯秒、連動モード、昼間のトグルは
 * 決定ボタンまで保存しない。
 * cache ?t=2606
 */

import { showViewportToast } from "./toast-viewport-v1.js";

const SITE_ID = "SEC-JP-KEEPRISING-001";
const API = "/api/home/v1/keeprising";
const DURATION_PRESETS = [5, 15, 45, 90, 120];
const WINDOW_PRESETS = [30, 60, 90, 120];

const BEAM_MODES = [
  {
    id: "staged_steady",
    label: "段階連動（標準点灯）",
    desc: "DI1でパトライト、DI2で投光器点灯、連続DI3で事務所ライトも全点灯（DI3単独は投光器のみ点灯）",
  },
  {
    id: "staged_blink",
    label: "段階連動（威嚇点滅）",
    desc: "DI1でパトライト、DI2で投光器が激しく点滅、連続DI3で事務所ライトも全点灯（DI3単独は投光器のみ点灯）",
  },
  {
    id: "full",
    label: "すぐ全警戒（即時フル作動）",
    desc: "どのビーム反応でもパトライト・投光器・事務所ライトを即座に全作動",
  },
  {
    id: "notify",
    label: "通知のみ",
    desc: "昼夜ともパトライト・投光器・事務所ライトは動かさずスマホ通知のみ",
  },
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

/** 並びは 警戒ON → 通知のみ → 警戒OFF */
export function renderKeepRisingGuardModes(mode, alerting) {
  const items = [
    { id: "away", label: "警戒 ON（外出警戒）" },
    { id: "home", label: "通知のみ" },
    { id: "disarmed", label: "警戒 OFF（解除）" },
  ];
  return items
    .map((item) => {
      const on = item.id === mode;
      const alert = on && item.id === "away" && alerting ? " is-alert" : "";
      return `<button type="button" class="sf-mode${on ? " is-on" : ""}${alert}" data-mode="${item.id}">${item.label}</button>`;
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

function durationButtons(sec) {
  const selected = snapKeepRisingDurationSec(sec);
  return DURATION_PRESETS.map((preset) => {
    const on = preset === selected ? " is-on" : "";
    return `<button type="button" class="kr-duration-btn${on}" data-kr-sec="${preset}" aria-pressed="${preset === selected ? "true" : "false"}">${preset}秒</button>`;
  }).join("");
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

function windowButtons(sec) {
  const selected = windowSec(sec);
  return WINDOW_PRESETS.map((preset) => {
    const on = preset === selected ? " is-on" : "";
    return `<button type="button" class="kr-duration-btn${on}" data-kr-window="${preset}" aria-pressed="${preset === selected ? "true" : "false"}">${preset}秒</button>`;
  }).join("");
}

function beamModeButtons(current) {
  const selected = beamModeId(current);
  return BEAM_MODES.map((row) => {
    const on = row.id === selected;
    return `<button type="button" class="kr-mode-btn${on ? " is-on" : ""}" data-kr-beam="${row.id}" aria-pressed="${on ? "true" : "false"}">
      <span class="kr-mode-label">${row.label}</span>
      <span class="kr-mode-desc">${row.desc}</span>
    </button>`;
  }).join("");
}

async function readSettings() {
  const res = await fetch(
    `${API}/settings?siteId=${SITE_ID}&t=${Date.now()}&_fresh=${Date.now()}`,
    {
    cache: "no-store",
    headers: authHeaders(),
  });
  const data = await res.json();
  return data.settings;
}

async function saveSettings(patch) {
  const res = await fetch(`${API}/settings`, {
    method: "PUT",
    cache: "no-store",
    headers: authHeaders(),
    body: JSON.stringify({ siteId: SITE_ID, ...patch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "保存に失敗しました");
  }
  return data.settings;
}

function render(root, settings) {
  root.innerHTML = `
    <summary>Keep Rising の連動設定</summary>
    <div class="kr-settings-body">
      <section class="kr-card">
        <h2>稼働時間</h2>
        <p>この時間だけ自動でライトとパトライトが動きます。初期値は 20:00 から翌朝 06:00 です。</p>
        <div class="kr-times">
          <label>開始
            <input type="time" data-kr="start" value="${settings.scheduleStart || "20:00"}" />
          </label>
          <label>終了
            <input type="time" data-kr="end" value="${settings.scheduleEnd || "06:00"}" />
          </label>
        </div>
        <label class="kr-day-relay" for="kr-daytime-relay">
          <span>昼間でもセンサー連動リレー（テスト）</span>
          <span class="kr-switch">
            <input type="checkbox" id="kr-daytime-relay" data-kr="daytime" ${settings.daytimeRelayTest ? "checked" : ""} />
            <span class="kr-switch-ui" aria-hidden="true"></span>
          </span>
          <strong data-kr-daytime-label>${settings.daytimeRelayTest ? "ON" : "OFF"}</strong>
        </label>
        <p>ON のあいだは、稼働時間の外でも選んだ連動のリレーを出します。通知のみのときは昼夜とも動かしません。決定するまで保存されません。</p>
      </section>
      <section class="kr-card">
        <h2>発報時の点灯秒数</h2>
        <p>センサーが反応したあとの保持時間です。決定するまで反映されません。</p>
        <div class="kr-duration" data-kr-duration-group>
          ${durationButtons(settings.durationSec)}
        </div>
      </section>
      <section class="kr-card" aria-label="段階ビーム連動モード">
        <h2>段階ビーム連動モード</h2>
        <p>選び方は「設定を決定する」まで保存されません。実機は回線が切れても、決定済みのモードで動きます。</p>
        <div class="kr-modes" role="radiogroup" aria-label="段階ビーム連動モード">
          ${beamModeButtons(settings.beamLinkMode)}
        </div>
        <h3 class="kr-subhead">連続侵入の判定秒数</h3>
        <p>DI2検知からこの秒数以内のDI3だけ、事務所ライトを足します。</p>
        <div class="kr-window" data-kr-window-group>
          ${windowButtons(settings.stageWindowSec)}
        </div>
      </section>
      <button type="button" class="kr-commit" data-kr-commit>設定を決定する</button>
      <p class="kr-note" data-kr-note>変更は「設定を決定する」まで保存されません。</p>
    </div>
  `;
}

function draftFrom(root) {
  const beam = root.querySelector(".kr-mode-btn.is-on");
  const windowBtn = root.querySelector("[data-kr-window].is-on");
  return {
    scheduleStart: root.querySelector('[data-kr="start"]')?.value || "20:00",
    scheduleEnd: root.querySelector('[data-kr="end"]')?.value || "06:00",
    durationSec: snapKeepRisingDurationSec(
      root.querySelector("[data-kr-sec].is-on")?.getAttribute("data-kr-sec")
    ),
    beamLinkMode: beamModeId(beam?.getAttribute("data-kr-beam")),
    stageWindowSec: windowSec(windowBtn?.getAttribute("data-kr-window")),
    daytimeRelayTest: Boolean(root.querySelector('[data-kr="daytime"]')?.checked),
  };
}

function bind(root) {
  const note = () => root.querySelector("[data-kr-note]");
  const markDirty = () => {
    const line = note();
    if (line) line.textContent = "未保存です。設定を決定するまで反映されません。";
  };
  root.addEventListener("input", markDirty);
  root.addEventListener("change", (event) => {
    const box = event.target.closest?.('[data-kr="daytime"]');
    if (!box) return;
    const label = root.querySelector("[data-kr-daytime-label]");
    if (label) label.textContent = box.checked ? "ON" : "OFF";
    markDirty();
  });
  root.addEventListener("click", async (event) => {
    const preset = event.target.closest?.("[data-kr-sec]");
    if (preset) {
      const group = preset.closest("[data-kr-duration-group]");
      group?.querySelectorAll(".kr-duration-btn").forEach((btn) => {
        const on = btn === preset;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const line = note();
      if (line) line.textContent = "未保存です。設定を決定するまで反映されません。";
      return;
    }
    const beam = event.target.closest?.("[data-kr-beam]");
    if (beam) {
      root.querySelectorAll(".kr-mode-btn").forEach((btn) => {
        const on = btn === beam;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const line = note();
      if (line) line.textContent = "未保存です。設定を決定するまで反映されません。";
      return;
    }
    const windowBtn = event.target.closest?.("[data-kr-window]");
    if (windowBtn) {
      const group = windowBtn.closest("[data-kr-window-group]");
      group?.querySelectorAll("[data-kr-window]").forEach((btn) => {
        const on = btn === windowBtn;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const line = note();
      if (line) line.textContent = "未保存です。設定を決定するまで反映されません。";
      return;
    }
    const commit = event.target.closest?.("[data-kr-commit]");
    if (commit) {
      commit.disabled = true;
      try {
        const saved = await saveSettings(draftFrom(root));
        const selected = snapKeepRisingDurationSec(saved?.durationSec);
        root.querySelectorAll("[data-kr-sec]").forEach((btn) => {
          const on = Number(btn.getAttribute("data-kr-sec")) === selected;
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const dayOn = Boolean(saved?.daytimeRelayTest);
        const dayBox = root.querySelector('[data-kr="daytime"]');
        if (dayBox) dayBox.checked = dayOn;
        const dayLabel = root.querySelector("[data-kr-daytime-label]");
        if (dayLabel) dayLabel.textContent = dayOn ? "ON" : "OFF";
        const savedMode = beamModeId(saved?.beamLinkMode);
        root.querySelectorAll(".kr-mode-btn").forEach((btn) => {
          const on = btn.getAttribute("data-kr-beam") === savedMode;
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const savedWindow = windowSec(saved?.stageWindowSec);
        root.querySelectorAll("[data-kr-window]").forEach((btn) => {
          const on = Number(btn.getAttribute("data-kr-window")) === savedWindow;
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const line = note();
        if (line) {
          line.textContent = `設定を決定し、保存しました（${beamModeLabel(savedMode)}、点灯 ${selected}秒、連続 ${savedWindow}秒、昼間連動 ${dayOn ? "ON" : "OFF"}）。`;
        }
        showViewportToast(
          "kr-save-toast",
          "ts-toast",
          `設定を保存しました（${beamModeLabel(savedMode)}）`,
          2800
        );
      } catch (err) {
        const line = note();
        if (line) line.textContent = err.message || "保存に失敗しました";
      } finally {
        commit.disabled = false;
      }
      return;
    }
  });
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
    root = document.createElement("details");
    root.id = "kr-customer-settings";
    root.className = "kr-settings";
    root.open = true;
    const shell = document.querySelector(".sf-soc-shell");
    if (shell) shell.before(root);
    else document.body.appendChild(root);
  }
  root.hidden = false;
  if (root.dataset.ready === "1") return;
  root.dataset.ready = "1";
  const fallback = {
    scheduleStart: "20:00",
    scheduleEnd: "06:00",
    durationSec: 30,
    beamLinkMode: "staged_steady",
    stageWindowSec: 60,
    daytimeRelayTest: false,
  };
  readSettings()
    .then((settings) => {
      render(root, settings || fallback);
      bind(root);
    })
    .catch(() => {
      render(root, fallback);
      bind(root);
      const line = root.querySelector("[data-kr-note]");
      if (line) line.textContent = "通信できないため、初期値を表示しています";
    });
}

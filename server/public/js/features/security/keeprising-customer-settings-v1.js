/**
 * Keep Rising の稼働設定。
 * 点灯秒と昼間の連動トグルは、
 * 決定ボタンまで保存しない。
 */

import { showViewportToast } from "./toast-viewport-v1.js";

const SITE_ID = "SEC-JP-KEEPRISING-001";
const API = "/api/home/v1/keeprising";
const DURATION_PRESETS = [5, 15, 45, 90, 120];

const FLOODS = [
  { key: "do1", label: "投光器1" },
  { key: "do2", label: "投光器2" },
  { key: "do3", label: "投光器3" },
  { key: "do7", label: "事務所室内灯" },
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

function modeButtons(key, mode) {
  const steady = mode === "blink" ? "" : " is-on";
  const blink = mode === "blink" ? " is-on" : "";
  return `
    <div class="kr-seg" data-kr-flood="${key}">
      <button type="button" class="kr-seg-btn${steady}" data-kr-mode="steady">点灯</button>
      <button type="button" class="kr-seg-btn${blink}" data-kr-mode="blink">点滅</button>
    </div>
  `;
}

function render(root, settings) {
  const modes = settings.floodModes || {};
  const floods = FLOODS.map(
    (row) => `
      <section class="kr-card">
        <h2>${row.label}</h2>
        <p>点灯か点滅を選びます。決定するまで保存されません。</p>
        ${modeButtons(row.key, modes[row.key] || "steady")}
      </section>
    `
  ).join("");
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
        <p>ON のあいだは、稼働時間の外でもセンサーが投光器・室内灯・パトライトを動かします。決定するまで保存されません。</p>
      </section>
      <section class="kr-card">
        <h2>発報時の点灯秒数</h2>
        <p>センサーが反応したあとの保持時間です。決定するまで反映されません。</p>
        <div class="kr-duration" data-kr-duration-group>
          ${durationButtons(settings.durationSec)}
        </div>
      </section>
      ${floods}
      <button type="button" class="kr-commit" data-kr-commit>設定を決定する</button>
      <p class="kr-note" data-kr-note>変更は「設定を決定する」まで保存されません。</p>
    </div>
  `;
}

function draftFrom(root) {
  const floodModes = {};
  root.querySelectorAll("[data-kr-flood]").forEach((group) => {
    const key = group.getAttribute("data-kr-flood");
    const on = group.querySelector(".kr-seg-btn.is-on");
    floodModes[key] = on?.getAttribute("data-kr-mode") === "blink" ? "blink" : "steady";
  });
  return {
    scheduleStart: root.querySelector('[data-kr="start"]')?.value || "20:00",
    scheduleEnd: root.querySelector('[data-kr="end"]')?.value || "06:00",
    durationSec: snapKeepRisingDurationSec(
      root.querySelector(".kr-duration-btn.is-on")?.getAttribute("data-kr-sec")
    ),
    floodModes,
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
    const mode = event.target.closest?.("[data-kr-mode]");
    if (mode) {
      const group = mode.closest("[data-kr-flood]");
      group.querySelectorAll(".kr-seg-btn").forEach((btn) => {
        btn.classList.toggle("is-on", btn === mode);
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
        root.querySelectorAll(".kr-duration-btn").forEach((btn) => {
          const on = Number(btn.getAttribute("data-kr-sec")) === selected;
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const dayOn = Boolean(saved?.daytimeRelayTest);
        const dayBox = root.querySelector('[data-kr="daytime"]');
        if (dayBox) dayBox.checked = dayOn;
        const dayLabel = root.querySelector("[data-kr-daytime-label]");
        if (dayLabel) dayLabel.textContent = dayOn ? "ON" : "OFF";
        const line = note();
        if (line) {
          line.textContent = `設定を決定し、保存しました（点灯 ${selected}秒、昼間連動 ${dayOn ? "ON" : "OFF"}）。`;
        }
        showViewportToast(
          "kr-save-toast",
          "ts-toast",
          `設定を保存しました（点灯 ${selected}秒）`,
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
    floodModes: { do1: "steady", do2: "steady", do3: "steady", do7: "steady" },
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

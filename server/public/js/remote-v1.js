/**
 * Remote v1 — RP2350 8ch 遠隔操作 PWA
 * /api/remote-test と連携（PoC トークン認証）
 */

const TOKEN_KEY = "tisly_remote_test_token";
const POLL_MS = 3000;

/** 8ch 機器定義（Waveshare リレー対応） */
const DEVICES = [
  { ch: 1, icon: "💡", name: "電灯ポール", sub: "CH1 · 外周照明", slider: false },
  { ch: 2, icon: "🪟", name: "電動シャッター", sub: "CH2 · 開閉制御", slider: true },
  { ch: 3, icon: "🌀", name: "換気扇", sub: "CH3 · 工場換気", slider: true },
  { ch: 4, icon: "🏭", name: "工場照明", sub: "CH4 · 高天井", slider: false },
  { ch: 5, icon: "💧", name: "循環ポンプ", sub: "CH5 · 水タンク", slider: false },
  { ch: 6, icon: "✨", name: "看板照明", sub: "CH6 · ネオン看板", slider: true },
  { ch: 7, icon: "❄️", name: "エアコン外機", sub: "CH7 · 電源リレー", slider: false },
  { ch: 8, icon: "🚨", name: "非常灯", sub: "CH8 · 避難誘導", slider: false },
];

/** ローカル UI 状態（スライダー値） */
const sliderState = Object.fromEntries(
  DEVICES.filter((d) => d.slider).map((d) => [`ch${d.ch}`, 50])
);

/** chStates キャッシュ */
let chStates = {};
let pollTimer = null;
let busy = false;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function getToken() {
  try {
    return (localStorage.getItem(TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...extra,
    "X-Remote-Test-Token": token,
    Authorization: `Bearer ${token}`,
  };
}

/** API 呼び出し（トークン必須） */
async function api(method, path, body) {
  const token = getToken();
  if (!token) throw new Error("トークン未設定");

  const res = await fetch(path, {
    method,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (res.status === 403) throw new Error("トークン不一致");
  if (res.status === 503) throw new Error("サーバー未設定");
  if (!res.ok) throw new Error(data.error || `${res.status}`);

  return data;
}

function isOn(ch) {
  const key = `ch${ch}`;
  return chStates[key] === true || chStates[key] === "on";
}

function stateLabel(on) {
  return on ? "🟢 ON" : "⚪ OFF";
}

function renderDevices() {
  const grid = $("device-grid");
  if (!grid) return;

  grid.innerHTML = DEVICES.map((d) => {
    const on = isOn(d.ch);
    const sliderHtml = d.slider
      ? `<div class="rv-slider-row" data-slider-ch="${d.ch}">
          <label>出力</label>
          <input type="range" min="0" max="100" value="${sliderState[`ch${d.ch}`] ?? 50}" />
          <span class="rv-slider-val">${sliderState[`ch${d.ch}`] ?? 50}%</span>
        </div>`
      : "";

    return `
      <article class="rv-device ${on ? "is-on" : "is-off"}" data-ch="${d.ch}" role="button" tabindex="0" aria-pressed="${on}">
        <div class="rv-device-icon">${d.icon}</div>
        <div class="rv-device-body">
          <h2>${d.name}</h2>
          <p>${d.sub}</p>
        </div>
        <div class="rv-toggle-wrap">
          <div class="rv-toggle" aria-hidden="true"></div>
          <span class="rv-state-pill">${stateLabel(on)}</span>
        </div>
        ${sliderHtml}
      </article>`;
  }).join("");

  grid.querySelectorAll(".rv-device").forEach((card) => {
    const ch = Number(card.dataset.ch);
    card.addEventListener("click", (e) => {
      if (e.target.closest(".rv-slider-row")) return;
      toggleChannel(ch);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleChannel(ch);
      }
    });
  });

  grid.querySelectorAll(".rv-slider-row input").forEach((input) => {
    input.addEventListener("input", (e) => {
      e.stopPropagation();
      const row = input.closest(".rv-slider-row");
      const ch = row?.dataset.sliderCh;
      if (!ch) return;
      sliderState[`ch${ch}`] = Number(input.value);
      const valEl = row.querySelector(".rv-slider-val");
      if (valEl) valEl.textContent = `${input.value}%`;
    });
    input.addEventListener("click", (e) => e.stopPropagation());
  });
}

/** チャンネル ON/OFF 切替 */
async function toggleChannel(ch) {
  if (busy) return;
  busy = true;
  const nextOn = !isOn(ch);
  const action = nextOn ? "on" : "off";

  try {
    await api("POST", `/api/remote-test/ch${ch}/${action}`);
    chStates[`ch${ch}`] = nextOn;
    renderDevices();
    toast(`${DEVICES.find((d) => d.ch === ch)?.name} → ${stateLabel(nextOn)}`);
  } catch (err) {
    toast(err.message || "操作失敗");
  } finally {
    busy = false;
  }
}

/** サーバー状態を取得して UI 同期 */
async function syncStatus() {
  const token = getToken();
  if (!token) {
    $("token-panel")?.classList.remove("hidden");
    $("device-badge").textContent = "未接続";
    $("device-badge").className = "rv-badge offline";
    return;
  }

  $("token-panel")?.classList.add("hidden");

  try {
    const [status, device] = await Promise.all([
      api("GET", "/api/remote-test/status"),
      api("GET", "/api/remote-test/device").catch(() => null),
    ]);

    if (status.chStates) {
      chStates = { ...status.chStates };
    }

    const online = device?.online === true;
    const badge = $("device-badge");
    if (badge) {
      badge.textContent = online ? "RP2350 オンライン" : "RP2350 オフライン";
      badge.className = `rv-badge ${online ? "online" : "offline"}`;
    }

    const syncBadge = $("sync-badge");
    if (syncBadge) {
      const t = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      syncBadge.textContent = `同期 ${t}`;
    }

    renderDevices();
  } catch (err) {
    if (err.message === "トークン未設定") {
      $("token-panel")?.classList.remove("hidden");
    } else {
      toast(err.message || "同期失敗");
    }
    renderDevices();
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(syncStatus, POLL_MS);
}

function initTokenPanel() {
  const input = $("token-input");
  const saved = getToken();
  if (input && saved) input.value = saved;

  $("token-save")?.addEventListener("click", async () => {
    const v = input?.value?.trim();
    if (!v) {
      toast("トークンを入力してください");
      return;
    }
    setToken(v);
    toast("トークン保存しました");
    await syncStatus();
    startPolling();
  });
}

function init() {
  initTokenPanel();
  renderDevices();
  syncStatus();
  startPolling();

  $("refresh-btn")?.addEventListener("click", () => syncStatus());

  // ネオン発光アニメ（追記・既存制御は維持）
  import("./tisly-neon-dark-v1.js")
    .then((m) => {
      m.mountNeonDarkModeV1();
    })
    .catch(() => {});
}

init();

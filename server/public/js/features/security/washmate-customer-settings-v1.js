/**
 * お客様画面だけの龍ヶ崎店 詳細設定。
 * 社内の /app では呼び出さない。
 * テストは確認ダイアログのあとだけ送る。
 */

const SITE_ID = "SEC-JP-RYUGASAKI-001";
const API = "/api/home/v1/ryugasaki";

export function isWashmateSecuritySite(siteId) {
  return String(siteId || "") === SITE_ID;
}

function isCustomerPage() {
  return document.body.classList.contains("sf-customer");
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

async function readSettings() {
  const res = await fetch(`${API}/settings?siteId=${SITE_ID}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const data = await res.json();
  return data.settings;
}

async function saveSettings(patch) {
  const res = await fetch(`${API}/settings`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ siteId: SITE_ID, ...patch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "保存に失敗しました");
  }
  return data.settings;
}

function askTestConfirm() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "wm-dialog";
    dialog.innerHTML = `
      <p>本当にテスト作動させますか？</p>
      <div class="wm-dialog-actions">
        <button type="button" class="wm-no">やめる</button>
        <button type="button" class="wm-yes">テストする</button>
      </div>
    `;
    const finish = (yes) => {
      dialog.close();
      dialog.remove();
      resolve(yes);
    };
    dialog.querySelector(".wm-no").addEventListener("click", () => finish(false));
    dialog.querySelector(".wm-yes").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      dialog.querySelector(".wm-no").focus();
    } else {
      finish(window.confirm("本当にテスト作動させますか？"));
    }
  });
}

function render(root, settings) {
  const di3Sec = Math.round((settings.di3ConfirmMs || 1000) / 1000);
  root.innerHTML = `
    <summary>詳細設定</summary>
    <div class="wm-settings-body">
      <section class="wm-card">
        <h2>バックヤードの人感センサー</h2>
        <p>反応が続いてから、お知らせするまでの時間です。</p>
        <label class="wm-slider">
          <strong data-wm-di3>${di3Sec}秒</strong>
          <input type="range" min="1" max="30" step="1" value="${di3Sec}" data-wm="di3" />
        </label>
      </section>
      <section class="wm-card">
        <h2>回転灯が回る時間</h2>
        <p>テストと遠隔の作動は、この秒数で止まります。</p>
        <label class="wm-slider">
          <strong data-wm-do1>${settings.do1DurationSec}秒</strong>
          <input type="range" min="5" max="180" step="1" value="${settings.do1DurationSec}" data-wm="do1" />
        </label>
      </section>
      <section class="wm-card">
        <h2>ベルが鳴る時間</h2>
        <p>テストと遠隔の作動は、この秒数で止まります。</p>
        <label class="wm-slider">
          <strong data-wm-do2>${settings.do2DurationSec}秒</strong>
          <input type="range" min="5" max="180" step="1" value="${settings.do2DurationSec}" data-wm="do2" />
        </label>
      </section>
      <section class="wm-card">
        <h2>動作テスト</h2>
        <p>ボタンのあと、確認してからだけ動きます。</p>
        <div class="wm-actions">
          <button type="button" data-wm-test="do1_test">回転灯テスト</button>
          <button type="button" data-wm-test="do2_test">ベルテスト</button>
        </div>
      </section>
      <p class="wm-note" data-wm-note></p>
    </div>
  `;
}

export function mountWashmateCustomerSettings(siteId) {
  const existing = document.getElementById("wm-customer-settings");
  const show = isCustomerPage() && isWashmateSecuritySite(siteId);
  if (!show) {
    if (existing) existing.hidden = true;
    return;
  }
  let root = existing;
  if (!root) {
    root = document.createElement("details");
    root.id = "wm-customer-settings";
    root.className = "wm-settings";
    root.open = true;
    const shell = document.querySelector(".sf-soc-shell");
    if (shell) shell.before(root);
    else document.body.appendChild(root);
  }
  root.hidden = false;
  if (root.dataset.ready === "1") return;
  root.dataset.ready = "1";
  const note = () => root.querySelector("[data-wm-note]");
  readSettings()
    .then((settings) => {
      render(root, settings);
      bind(root, note);
    })
    .catch(() => {
      render(root, {
        di3ConfirmMs: 1000,
        do1DurationSec: 15,
        do2DurationSec: 15,
      });
      bind(root, note);
      const line = note();
      if (line) line.textContent = "通信できないため、初期値を表示しています";
    });
}

function bind(root, note) {
  let timer = 0;
  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-wm]");
    if (!input) return;
    const kind = input.getAttribute("data-wm");
    const value = Number(input.value);
    const label = root.querySelector(`[data-wm-${kind}]`);
    if (label) label.textContent = `${value}秒`;
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const patch =
        kind === "di3"
          ? { di3ConfirmMs: value * 1000 }
          : kind === "do1"
            ? { do1DurationSec: value }
            : { do2DurationSec: value };
      try {
        await saveSettings(patch);
        const line = note();
        if (line) line.textContent = "保存しました";
      } catch (err) {
        const line = note();
        if (line) line.textContent = err.message || "保存に失敗しました";
      }
    }, 250);
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-wm-test]");
    if (!button || root.dataset.testing === "1") return;
    const action = button.getAttribute("data-wm-test");
    const yes = await askTestConfirm();
    if (!yes) return;
    root.dataset.testing = "1";
    button.disabled = true;
    try {
      const res = await fetch(`${API}/test`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          siteId: SITE_ID,
          action,
          confirmed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "テストを送れませんでした");
      }
      const line = note();
      if (line) {
        line.textContent = `テストを送りました（${data.durationSec}秒）`;
      }
    } catch (err) {
      const line = note();
      if (line) line.textContent = err.message || "テストを送れませんでした";
    } finally {
      button.disabled = false;
      root.dataset.testing = "0";
    }
  });
}

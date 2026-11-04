/**
 * Keep Rising の稼働設定と日中テスト。
 * スライダーは表示だけ変え、
 * 決定ボタンまで保存しない。
 */

const SITE_ID = "SEC-JP-KEEPRISING-001";
const API = "/api/home/v1/keeprising";

const FLOODS = [
  { key: "do1", label: "投光器1" },
  { key: "do2", label: "投光器2" },
  { key: "do3", label: "投光器3" },
  { key: "do7", label: "投光器4（投光器3と束ねる）" },
];

export function isKeepRisingSecuritySite(siteId) {
  const id = String(siteId || "");
  return id === SITE_ID || id.includes("KEEPRISING");
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

function askTestConfirm(label) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "kr-dialog";
    dialog.innerHTML = `
      <p>${label}の連動を、稼働時間外でも動かします。よろしいですか？</p>
      <div class="kr-dialog-actions">
        <button type="button" class="kr-no">やめる</button>
        <button type="button" class="kr-yes">日中テスト発報</button>
      </div>
    `;
    const finish = (yes) => {
      dialog.close();
      dialog.remove();
      resolve(yes);
    };
    dialog.querySelector(".kr-no").addEventListener("click", () => finish(false));
    dialog.querySelector(".kr-yes").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      dialog.querySelector(".kr-no").focus();
    } else {
      finish(window.confirm(`${label}の日中テスト発報を送りますか？`));
    }
  });
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
      </section>
      <section class="kr-card">
        <h2>発報時の点灯秒数</h2>
        <p>センサーが反応したあとの保持時間です。決定するまで反映されません。</p>
        <label class="kr-slider">
          <strong data-kr-duration>${settings.durationSec || 30}秒</strong>
          <input type="range" min="5" max="180" step="1" value="${settings.durationSec || 30}" data-kr="duration" />
        </label>
      </section>
      ${floods}
      <button type="button" class="kr-commit" data-kr-commit>設定を決定する</button>
      <section class="kr-card">
        <h2>日中テスト発報</h2>
        <p>稼働時間外でも、選んだセンサーと同じ出力を一度だけ確認します。門は通知だけです。</p>
        <label class="kr-select">
          確認するセンサー
          <select data-kr-di>
            <option value="1">センサー1（青丸パトライト）</option>
            <option value="2">門マグネット（通知のみ）</option>
            <option value="3">センサー2（投光器2台とスピーカー）</option>
            <option value="4" selected>センサー3（投光器・事務所・スピーカー）</option>
          </select>
        </label>
        <button type="button" class="kr-test" data-kr-test>日中テスト発報</button>
      </section>
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
    durationSec: Number(root.querySelector('[data-kr="duration"]')?.value) || 30,
    floodModes,
  };
}

function bind(root) {
  const note = () => root.querySelector("[data-kr-note]");
  root.addEventListener("input", (event) => {
    const duration = event.target.closest?.('[data-kr="duration"]');
    if (duration) {
      const label = root.querySelector("[data-kr-duration]");
      if (label) label.textContent = `${duration.value}秒`;
    }
    const line = note();
    if (line) line.textContent = "未保存です。設定を決定するまで反映されません。";
  });
  root.addEventListener("click", async (event) => {
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
        await saveSettings(draftFrom(root));
        const line = note();
        if (line) line.textContent = "設定を決定し、保存しました。";
      } catch (err) {
        const line = note();
        if (line) line.textContent = err.message || "保存に失敗しました";
      } finally {
        commit.disabled = false;
      }
      return;
    }
    const test = event.target.closest?.("[data-kr-test]");
    if (!test || root.dataset.testing === "1") return;
    const select = root.querySelector("[data-kr-di]");
    const di = Number(select?.value || 4);
    const label = select?.selectedOptions?.[0]?.textContent || "センサー";
    const yes = await askTestConfirm(label);
    if (!yes) return;
    root.dataset.testing = "1";
    test.disabled = true;
    try {
      const res = await fetch(`${API}/day-test`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          siteId: SITE_ID,
          di,
          confirmed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "テストを送れませんでした");
      }
      const line = note();
      if (line) {
        line.textContent = `日中テストを送りました（${data.durationSec}秒）`;
      }
    } catch (err) {
      const line = note();
      if (line) line.textContent = err.message || "テストを送れませんでした";
    } finally {
      test.disabled = false;
      root.dataset.testing = "0";
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

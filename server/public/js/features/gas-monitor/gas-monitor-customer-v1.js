/**
 * お客様向けガス見守り UI
 * ビッグステータス · 使用量 · 見守り通知
 * 3秒ポーリングでは DOM を作り直さず
 * 数値テキストだけを差分更新する
 * （開いた詳細カードは絶対に閉じない）
 */

import { createAccordionStateV1 } from "./gas-monitor-accordion-state-v1.js?v=2452";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let usageChart = null;
let refreshInFlight = false;
let customerProperties = [];

// 詳細カードの開閉状態（openPropertyIds）
const accordion = createAccordionStateV1("customer");

/** 断片HTMLから要素を1つ作る（画面外生成） */
function elFromHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html).trim();
  return tpl.content.firstElementChild;
}

function removeAllChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function setText(el, text) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
}

/**
 * キー付き子要素を追加・並び替え・削除で同期
 * 既存要素は再生成しない
 */
function syncKeyedChildren(options) {
  const {
    parent,
    items,
    selector,
    datasetKey,
    keyOf,
    create,
    patch,
  } = options;
  if (!parent) return;
  const existing = new Map();
  parent.querySelectorAll(selector).forEach((el) => {
    const key = el.dataset[datasetKey];
    if (key) existing.set(key, el);
  });
  // 同一キーが複数来ても取り違えない
  const seen = new Map();
  items.forEach((item, index) => {
    const base = keyOf(item, index);
    const dup = seen.get(base) || 0;
    seen.set(base, dup + 1);
    const key = dup ? `${base}#${dup}` : base;
    let el = existing.get(key);
    if (el) existing.delete(key);
    else el = create(item, index);
    if (!el) return;
    if (el.dataset[datasetKey] !== key) {
      el.dataset[datasetKey] = key;
    }
    patch(el, item);
    const current = parent.children[index];
    if (current !== el) parent.insertBefore(el, current || null);
  });
  existing.forEach((el) => el.remove());
}

function setEmptyState(empty) {
  const emptyState = document.getElementById("gm-empty-state");
  if (emptyState) emptyState.hidden = !empty;
  document.querySelectorAll(".gm-live-section").forEach((section) => {
    section.hidden = empty;
  });
  const deleteButton = document.getElementById("gm-delete-property");
  if (deleteButton) deleteButton.hidden = empty;
}

function ensureSelectedProperty(d) {
  const select = document.getElementById("gm-property-select");
  if (!select || !d) return;
  const exists = [...select.options].some(
    (option) => option.value === d.propertyId
  );
  if (!exists) {
    select.add(new Option(d.displayName, d.propertyId));
  }
  select.disabled = false;
  select.value = d.propertyId;
}

async function loadCustomer(propertyId) {
  const q = propertyId
    ? `?propertyId=${encodeURIComponent(propertyId)}`
    : "";
  const res = await fetch(`/api/gas-monitor/v1/customer${q}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込失敗");
  return data.dashboard;
}

async function loadProperties() {
  const res = await fetch("/api/gas-monitor/v1/properties", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "物件一覧失敗");
  return data.properties || [];
}

function customerAuthHeaders() {
  const token =
    localStorage.getItem("tisly_admin_token") ||
    sessionStorage.getItem("tisly_token") ||
    "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function renderPropertyCount() {
  setText(
    document.getElementById("gm-property-count"),
    String(customerProperties.length)
  );
}

/**
 * 選択中の物件を確認後に削除し、
 * 次の物件または空状態へ即時切り替える。
 */
async function deleteSelectedProperty() {
  const select = document.getElementById("gm-property-select");
  const button = document.getElementById("gm-delete-property");
  const propertyId = String(select?.value || "");
  if (!propertyId || !button) return;
  const propertyName =
    select.options[select.selectedIndex]?.text || "この物件";
  const confirmed = window.confirm(
    `『${propertyName}』を削除しますか？監視データも消去されます`
  );
  if (!confirmed) return;

  button.disabled = true;
  try {
    const response = await fetch("/api/device/unbind", {
      method: "DELETE",
      headers: customerAuthHeaders(),
      body: JSON.stringify({ property_id: propertyId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "物件を削除できませんでした");
    }

    button.classList.add("is-removing");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    customerProperties = customerProperties.filter(
      (property) => property.id !== propertyId
    );
    select.options[select.selectedIndex]?.remove();
    renderPropertyCount();
    button.classList.remove("is-removing");
    button.disabled = false;

    if (!customerProperties.length) {
      removeAllChildren(select);
      select.add(new Option("登録物件なし", ""));
      select.disabled = true;
      setEmptyState(true);
      renderMappedPorts({ mappedPorts: [] });
      return;
    }
    select.disabled = false;
    select.selectedIndex = 0;
    await refresh();
  } catch (error) {
    button.disabled = false;
    button.classList.remove("is-removing");
    window.alert(error.message);
  }
}

function lastSeenText(lastSeenAt) {
  if (!lastSeenAt) return "通信待ち";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000)
  );
  if (seconds < 60) return `${seconds}秒前`;
  return `${Math.floor(seconds / 60)}分前`;
}

function renderStatus(d) {
  const hero = document.getElementById("gm-status-hero");
  const emoji = document.getElementById("gm-status-emoji");
  const label = document.getElementById("gm-status-label");
  hero.classList.toggle("is-normal", d.status === "normal");
  hero.classList.toggle("is-emergency", d.status === "emergency");
  emoji.textContent = d.statusEmoji;
  label.textContent = d.statusLabel;
  const online = document.getElementById("gm-device-online");
  const mark = d.deviceOnline ? "🟢 実機オンライン" : "⚪ 実機オフライン";
  setText(
    online,
    `${mark}（最終通信: ${lastSeenText(d.lastUpdatedAt)}）`
  );
}

function renderLifeCare(d) {
  const hero = document.getElementById("gm-lifecare-hero");
  const emoji = document.getElementById("gm-lifecare-emoji");
  const label = document.getElementById("gm-lifecare-label");
  const mm = document.getElementById("gm-lifecare-mmwave");
  if (!hero || !d.lifeCare) return;
  const lc = d.lifeCare;
  hero.classList.remove("is-warn", "is-critical");
  if (lc.alertLevel === "warn") hero.classList.add("is-warn");
  if (lc.alertLevel === "critical") {
    hero.classList.add("is-critical");
  }
  setText(emoji, lc.statusEmoji || "🟢");
  setText(label, lc.statusLabel || "正常生活反応");
  const mw = lc.mmWave || {};
  const detected = mw.detected ? "反応あり" : "反応なし";
  const dwell = Number(mw.dwellMinutes || 0);
  setText(mm, `生活センサー: ${detected} · 滞留 ${dwell}分`);
}

function renderMeta(d) {
  setText(document.getElementById("gm-meta-name"), d.displayName);
  setText(document.getElementById("gm-meta-addr"), d.addressLabel);
  setText(
    document.getElementById("gm-meta-building"),
    d.buildingName || "—"
  );
  setText(
    document.getElementById("gm-usage-m3"),
    Number(d.todayUsageM3).toFixed(2)
  );
}

function renderNotes(d) {
  const ul = document.getElementById("gm-notes");
  if (!ul) return;
  const notes = d.lifeWatchNotes || [];
  const rows = notes.length
    ? notes
    : ["本日の見守り通知はまだありません"];
  // 初期表示の「読み込み中…」を取り除く
  ul.querySelectorAll("li:not([data-note-index])").forEach((li) => {
    li.remove();
  });
  // 行数が同じ時は文字だけ差し替える
  syncKeyedChildren({
    parent: ul,
    items: rows,
    selector: "li[data-note-index]",
    datasetKey: "noteIndex",
    keyOf: (_note, index) => String(index),
    create: (_note, index) => {
      const li = document.createElement("li");
      li.dataset.noteIndex = String(index);
      return li;
    },
    patch: (el, note) => setText(el, note),
  });
}

function usageChartConfig(values) {
  return {
    type: "bar",
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i}時`),
      datasets: [
        {
          label: "使用量 m³",
          data: values,
          backgroundColor: "rgba(30, 58, 138, 0.75)",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "m³" },
        },
      },
    },
  };
}

function sameUsageValues(prev, next) {
  if (!Array.isArray(prev) || prev.length !== next.length) {
    return false;
  }
  return next.every((v, i) => Number(prev[i]) === Number(v));
}

function renderChart(d) {
  const canvas = document.getElementById("gm-usage-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const values = [...(d.hourlyUsageM3 || [])];
  if (!usageChart) {
    usageChart = new Chart(canvas, usageChartConfig(values));
    return;
  }
  // グラフは作り直さず数値だけ差分更新
  const dataset = usageChart.data.datasets[0];
  if (sameUsageValues(dataset.data, values)) return;
  dataset.data = values;
  usageChart.update("none");
}

function portKey(port) {
  const device = port.deviceId || "device";
  return `${device}:${port.portType}${port.portNumber}`;
}

function portMeterText(port) {
  if (port.operationMode !== "pulse") {
    return "状態を見守っています";
  }
  const value = Number(
    port.currentMeterValue ?? port.initialMeterValue
  ).toLocaleString("ja-JP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  return `現在のメーター指針値 ${value} m³`;
}

function mappedPortHtml(port) {
  return `
    <article class="gm-mapped-port" data-port-key="${escapeHtml(
      portKey(port)
    )}">
      <b>ガスメーター</b>
      <span data-gm-role="port-label">${escapeHtml(port.label)}</span>
      <small class="meter-value-text" data-gm-role="port-meter">${escapeHtml(
        portMeterText(port)
      )}</small>
    </article>`;
}

/** メーター値だけを差分更新（作り直さない） */
function patchMappedPort(el, port) {
  setText(el.querySelector('[data-gm-role="port-label"]'), port.label);
  setText(
    el.querySelector('[data-gm-role="port-meter"]'),
    portMeterText(port)
  );
}

function renderMappedPorts(d) {
  const card = document.getElementById("gm-mapped-ports-card");
  const root = document.getElementById("gm-mapped-port-list");
  const ports = d.mappedPorts || [];
  const hidden = ports.length === 0;
  if (card && card.hidden !== hidden) card.hidden = hidden;
  syncKeyedChildren({
    parent: root,
    items: ports,
    selector: "article[data-port-key]",
    datasetKey: "portKey",
    keyOf: portKey,
    create: (port) => elFromHtml(mappedPortHtml(port)),
    patch: patchMappedPort,
  });
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  const select = document.getElementById("gm-property-select");
  const id = select?.value || "";
  try {
    const d = await loadCustomer(id || null);
    if (!d) {
      setEmptyState(true);
      return;
    }
    ensureSelectedProperty(d);
    setEmptyState(false);
    renderStatus(d);
    renderLifeCare(d);
    renderMeta(d);
    renderNotes(d);
    renderChart(d);
    renderMappedPorts(d);
    // 開いていた詳細カードを開いたまま維持
    accordion.restore(document.querySelector(".gm-main"));
  } finally {
    refreshInFlight = false;
  }
}

async function init() {
  const back = document.getElementById("gm-back-link");
  if (back) back.href = "/customer";
  accordion.track(document.querySelector(".gm-main"));

  const select = document.getElementById("gm-property-select");
  const props = await loadProperties();
  customerProperties = props;
  renderPropertyCount();
  // 物件リストは初回のみ組み立てる
  removeAllChildren(select);
  if (!props.length) {
    select.add(new Option("登録物件なし", ""));
    select.disabled = true;
    setEmptyState(true);
  } else {
    props.forEach((p) => {
      select.add(new Option(p.displayName, p.id));
    });
    select.disabled = false;
  }
  select.addEventListener("change", () => {
    refresh().catch(console.error);
  });
  document
    .getElementById("gm-delete-property")
    ?.addEventListener("click", () => {
      deleteSelectedProperty().catch(console.error);
    });
  await refresh();
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh().catch(console.error);
    }
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    const label = document.getElementById("gm-status-label");
    if (label) label.textContent = "読み込みに失敗しました";
  });
});

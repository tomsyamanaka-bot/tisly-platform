/**
 * お客様向けガス見守り UI
 * ビッグステータス · 使用量 · 見守り通知
 * 3秒ポーリングは差分更新のみ
 * （開いた詳細カードは閉じない）
 */

import { createAccordionStateV1 } from "./gas-monitor-accordion-state-v1.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let usageChart = null;
let refreshInFlight = false;

// 詳細カードの開閉状態（openPropertyIds）
const accordion = createAccordionStateV1("customer");

// innerHTML の再設定を最小化するキャッシュ
const htmlCache = new WeakMap();

function setText(el, text) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
}

function setHtmlCached(el, html) {
  if (!el) return;
  if (htmlCache.get(el) === html) return;
  el.innerHTML = html;
  htmlCache.set(el, html);
}

function setEmptyState(empty) {
  const emptyState = document.getElementById("gm-empty-state");
  if (emptyState) emptyState.hidden = !empty;
  document.querySelectorAll(".gm-live-section").forEach((section) => {
    section.hidden = empty;
  });
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

function renderStatus(d) {
  const hero = document.getElementById("gm-status-hero");
  const emoji = document.getElementById("gm-status-emoji");
  const label = document.getElementById("gm-status-label");
  hero.classList.toggle("is-normal", d.status === "normal");
  hero.classList.toggle("is-emergency", d.status === "emergency");
  emoji.textContent = d.statusEmoji;
  label.textContent = d.statusLabel;
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
  const notes = d.lifeWatchNotes || [];
  if (!notes.length) {
    setHtmlCached(ul, `<li>本日の見守り通知はまだありません</li>`);
    return;
  }
  setHtmlCached(
    ul,
    notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")
  );
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

function renderMappedPorts(d) {
  const card = document.getElementById("gm-mapped-ports-card");
  const root = document.getElementById("gm-mapped-port-list");
  const ports = d.mappedPorts || [];
  const hidden = ports.length === 0;
  if (card && card.hidden !== hidden) card.hidden = hidden;
  const html = ports
    .map(
      (port) => `
        <article class="gm-mapped-port">
          <b>ガスメーター</b>
          <span>${escapeHtml(port.label)}</span>
          <small>
            ${
              port.operationMode === "pulse"
                ? `現在のメーター指針値 ${Number(
                    port.currentMeterValue ?? port.initialMeterValue
                  ).toLocaleString("ja-JP", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 3,
                  })} m³`
                : "状態を見守っています"
            }
          </small>
        </article>`
    )
    .join("");
  // 変化が無ければ DOM を触らない
  setHtmlCached(root, html);
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
  if (!props.length) {
    select.innerHTML = `<option value="">登録物件なし</option>`;
    select.disabled = true;
    setEmptyState(true);
  } else {
    select.innerHTML = props
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}">${escapeHtml(p.displayName)}</option>`
      )
      .join("");
    select.disabled = false;
  }
  select.addEventListener("change", () => {
    refresh().catch(console.error);
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

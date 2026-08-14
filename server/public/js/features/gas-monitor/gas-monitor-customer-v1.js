/**
 * お客様向けガス見守り UI
 * ビッグステータス · 使用量 · 見守り通知
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let usageChart = null;

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
  emoji.textContent = lc.statusEmoji || "🟢";
  label.textContent = lc.statusLabel || "正常生活反応";
  const mw = lc.mmWave || {};
  mm.textContent = `生活センサー: ${
    mw.detected ? "反応あり" : "反応なし"
  } · 滞留 ${Number(mw.dwellMinutes || 0)}分`;
}

function renderMeta(d) {
  document.getElementById("gm-meta-name").textContent = d.displayName;
  document.getElementById("gm-meta-addr").textContent = d.addressLabel;
  const b = document.getElementById("gm-meta-building");
  if (b) {
    b.textContent = d.buildingName || "—";
  }
  document.getElementById("gm-usage-m3").textContent =
    Number(d.todayUsageM3).toFixed(2);
}

function renderNotes(d) {
  const ul = document.getElementById("gm-notes");
  const notes = d.lifeWatchNotes || [];
  if (!notes.length) {
    ul.innerHTML = `<li>本日の見守り通知はまだありません</li>`;
    return;
  }
  ul.innerHTML = notes
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");
}

function renderChart(d) {
  const canvas = document.getElementById("gm-usage-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = Array.from({ length: 24 }, (_, i) => `${i}時`);
  const values = d.hourlyUsageM3 || [];
  if (usageChart) usageChart.destroy();
  usageChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
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
  });
}

function renderMappedPorts(d) {
  const card = document.getElementById("gm-mapped-ports-card");
  const root = document.getElementById("gm-mapped-port-list");
  const ports = d.mappedPorts || [];
  card.hidden = ports.length === 0;
  root.innerHTML = ports
    .map(
      (port) => `
        <article class="gm-mapped-port">
          <b>${port.portType}${port.portNumber}</b>
          <span>${escapeHtml(port.label)}</span>
          <small>
            ${
              port.operationMode === "pulse"
                ? `${port.initialMeterValue.toLocaleString("ja-JP")} m³`
                : "状態を見守っています"
            }
          </small>
        </article>`
    )
    .join("");
}

async function refresh() {
  const select = document.getElementById("gm-property-select");
  const id = select?.value || "";
  const d = await loadCustomer(id || null);
  renderStatus(d);
  renderLifeCare(d);
  renderMeta(d);
  renderNotes(d);
  renderChart(d);
  renderMappedPorts(d);
}

async function init() {
  const back = document.getElementById("gm-back-link");
  if (back) back.href = "/customer";

  const select = document.getElementById("gm-property-select");
  const props = await loadProperties();
  // お客様向けは JP 戸建て・アパートを優先表示
  const customerProps = props.filter(
    (p) => p.countryCode === "JP" && p.kind !== "shop"
  );
  const list = customerProps.length ? customerProps : props;
  select.innerHTML = list
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.displayName)}</option>`
    )
    .join("");
  select.addEventListener("change", () => {
    refresh().catch(console.error);
  });
  await refresh();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    const label = document.getElementById("gm-status-label");
    if (label) label.textContent = "読み込みに失敗しました";
  });
});

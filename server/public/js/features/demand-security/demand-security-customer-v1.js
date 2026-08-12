/**
 * お客様向け
 * 電気デマンド · 防犯状態カード
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let currentChart = null;

async function loadCustomer(siteId) {
  const q = siteId
    ? `?siteId=${encodeURIComponent(siteId)}`
    : "";
  const res = await fetch(
    `/api/demand-security/v1/customer${q}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "読込失敗");
  return data.dashboard;
}

async function loadSites() {
  const res = await fetch("/api/demand-security/v1/sites", {
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "物件一覧失敗");
  return data.sites || [];
}

function renderStatus(d) {
  const hero = document.getElementById("ds-status-hero");
  const emoji = document.getElementById("ds-status-emoji");
  const label = document.getElementById("ds-status-label");
  hero.classList.remove(
    "is-normal",
    "is-peak_cut",
    "is-security_alert"
  );
  hero.classList.add(`is-${d.status}`);
  emoji.textContent = d.statusEmoji;
  label.textContent = d.statusLabel;
}

function renderMetrics(d) {
  document.getElementById("ds-current-a").textContent =
    Number(d.mainCurrentA).toFixed(1);
  document.getElementById("ds-demand-kw").textContent =
    `${Number(d.currentDemandKw).toFixed(1)} / ${Number(d.contractDemandKw).toFixed(0)}`;
  document.getElementById("ds-peak-label").textContent =
    d.peakCutLabel;
  document.getElementById("ds-door-label").textContent =
    d.doorLabel;
  document.getElementById("ds-motion-label").textContent =
    d.motionLabel;
}

function renderNotes(d) {
  const ul = document.getElementById("ds-notes");
  const notes = d.notes || [];
  if (!notes.length) {
    ul.innerHTML = `<li>本日のお知らせはありません</li>`;
    return;
  }
  ul.innerHTML = notes
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");
}

function renderChart(d) {
  const canvas = document.getElementById("ds-current-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = Array.from({ length: 24 }, (_, i) => `${i}時`);
  const values = d.hourlyCurrentA || [];
  if (currentChart) currentChart.destroy();
  currentChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "電流 A",
          data: values,
          borderColor: "#1e3a8a",
          backgroundColor: "rgba(30, 58, 138, 0.15)",
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
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
          title: { display: true, text: "A" },
        },
      },
    },
  });
}

async function refresh() {
  const select = document.getElementById("ds-site-select");
  const id = select?.value || "";
  const d = await loadCustomer(id || null);
  renderStatus(d);
  renderMetrics(d);
  renderNotes(d);
  renderChart(d);
}

async function init() {
  const back = document.getElementById("ds-back-link");
  if (back) back.href = "/customer";

  const select = document.getElementById("ds-site-select");
  const sites = await loadSites();
  // お客様向けは JP の戸建て・店舗を優先
  const preferred = sites.filter(
    (s) => s.countryCode === "JP" && s.kind !== "factory"
  );
  const list = preferred.length ? preferred : sites;
  select.innerHTML = list
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}">${escapeHtml(s.displayName)}</option>`
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
    const label = document.getElementById("ds-status-label");
    if (label) label.textContent = "読み込みに失敗しました";
  });
});

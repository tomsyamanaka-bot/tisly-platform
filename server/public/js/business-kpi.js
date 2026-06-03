import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";

async function loadKpi() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const res = await fetch("/api/toms/kpi", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return;
  const k = await res.json();
  const cards = [
    ["売上合計", `¥${k.revenue.toLocaleString()}`],
    ["粗利", `¥${k.grossProfit.toLocaleString()}`],
    ["案件数", k.projectCount],
    ["未請求", k.uninvoiced],
    ["未入金", k.unpaid],
    ["保守件数", k.maintenanceCases ?? k.maintenanceContracts],
    ["異常件数", k.anomalyCount ?? 0],
    ["平均施工日数", k.avgConstructionDays],
    ["見積承認率", `${k.estimateApprovalRate}%`],
  ];
  document.getElementById("kpi-cards").innerHTML = cards
    .map(([label, val]) => `<div class="kpi-card">${label}<strong>${val}</strong></div>`)
    .join("");
  const tbody = document.querySelector("#kpi-monthly tbody");
  tbody.innerHTML = (k.monthly || [])
    .map(
      (m) =>
        `<tr><td>${m.month}</td><td>¥${m.revenue.toLocaleString()}</td><td>¥${m.grossProfit.toLocaleString()}</td><td>${m.projectCount}</td></tr>`
    )
    .join("");

  const custEl = document.getElementById("kpi-by-customer");
  if (custEl) {
    custEl.querySelector("tbody").innerHTML = (k.byCustomer || [])
      .slice(0, 20)
      .map(
        (c) =>
          `<tr><td>${c.customerName}</td><td>¥${c.revenue.toLocaleString()}</td><td>¥${c.grossProfit.toLocaleString()}</td>
          <td>${c.uninvoiced}</td><td>${c.unpaid}</td><td>${c.maintenanceCount}</td><td>${c.anomalyCount}</td></tr>`
      )
      .join("");
  }
  const siteEl = document.getElementById("kpi-by-site");
  if (siteEl) {
    siteEl.querySelector("tbody").innerHTML = (k.bySite || [])
      .slice(0, 20)
      .map(
        (s) =>
          `<tr><td>${s.siteName}</td><td>${s.address}</td><td>${s.projectCount}</td>
          <td>¥${s.revenue.toLocaleString()}</td><td>${s.anomalyCount}</td></tr>`
      )
      .join("");
  }
}

loadKpi().catch(console.error);
renderPwaTopbar("business", "KPI Dashboard");

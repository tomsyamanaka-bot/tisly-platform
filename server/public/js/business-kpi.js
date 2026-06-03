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
    ["保守契約", k.maintenanceContracts],
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
}

loadKpi().catch(console.error);
renderPwaTopbar("business", "KPI Dashboard");

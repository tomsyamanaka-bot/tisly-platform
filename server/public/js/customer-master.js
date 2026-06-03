import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const detailId =
  window.location.pathname.split("/customer-master/")[1]?.split("/")[0] || "";

function authHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loadList() {
  const res = await fetch("/api/toms/customer-master", { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const list = document.getElementById("cm-list");
  list.innerHTML = (data.customers || [])
    .map(
      (c) =>
        `<div class="row" data-id="${c.id}">
          <strong>${c.name}</strong> ${c.company}<br>
          <small>${c.phone} · ${c.address}</small>
        </div>`
    )
    .join("");
  list.querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", () => {
      window.location.href = `/customer-master/${el.dataset.id}`;
    });
  });
}

async function loadDetail(id) {
  const res = await fetch(`/api/toms/customer-master/${id}`, { headers: authHeaders() });
  if (!res.ok) return;
  const c = await res.json();
  const panel = document.getElementById("cm-detail");
  panel.hidden = false;
  panel.innerHTML = `
    <h2>${c.name}</h2>
    <p>${c.company} · ${c.email} · ${c.phone}<br>${c.address}</p>
    ${c.kpi ? `<div class="kpi-inline">
      <span>売上 ¥${c.kpi.revenue.toLocaleString()}</span>
      <span>粗利 ¥${c.kpi.grossProfit.toLocaleString()}</span>
      <span>未請求 ${c.kpi.uninvoiced}</span>
      <span>未入金 ${c.kpi.unpaid}</span>
      <span>異常 ${c.kpi.anomalyCount}</span>
    </div>` : ""}
    <h3>現場一覧</h3>
    <ul>${(c.sites || []).map((s) => `<li>${s.name} — ${s.address}</li>`).join("") || "<li>—</li>"}</ul>
    <h3>案件一覧 (${c.projects?.length ?? 0})</h3>
    <ul>${(c.projects || [])
      .map((p) => `<li><a href="/project/${p.id}">${p.title}</a> (${p.status})</li>`)
      .join("")}</ul>
    <h3>設備 (${c.devices?.length ?? 0})</h3>
    <ul>${(c.devices || [])
      .slice(0, 20)
      .map((d) => `<li>${d.label || d.deviceId} — ${d.deviceStatus}</li>`)
      .join("")}</ul>
    <h3>請求履歴</h3>
    <ul>${(c.invoiceHistory || [])
      .map((i) => `<li>${i.invoiceNo} ¥${i.total}</li>`)
      .join("")}</ul>
    <h3>入金履歴</h3>
    <ul>${(c.paymentHistory || [])
      .map((i) => `<li>¥${i.amount} (${i.date}) — <a href="/project/${i.projectId}">案件</a></li>`)
      .join("")}</ul>
    <h3>保守履歴</h3>
    <ul>${(c.maintenanceHistory || [])
      .map((m) => `<li>${m.site_name || m.case_id} — ${m.status}</li>`)
      .join("")}</ul>
    <h3>通知履歴</h3>
    <ul>${(c.notificationHistory || [])
      .map((n) => `<li>${n.title} (<a href="/project/${n.projectId}">案件</a>)</li>`)
      .join("")}</ul>`;
}

document.getElementById("cm-search")?.addEventListener("input", async (ev) => {
  const q = ev.target.value.trim();
  if (q.length < 2) {
    if (!detailId) loadList();
    return;
  }
  const res = await fetch(`/api/toms/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("cm-list").innerHTML = (data.hits || [])
    .map(
      (h) =>
        `<div class="row"><a href="${h.href}"><strong>${h.title}</strong></a><br><small>${h.subtitle}</small></div>`
    )
    .join("");
});

if (detailId) {
  loadDetail(detailId).catch(console.error);
} else {
  loadList().catch(console.error);
}
renderPwaTopbar("business", "顧客台帳");

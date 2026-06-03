import { renderPwaTopbar } from "./tisly-pwa-shell.js";

const TOKEN_KEY = "tisly_token";
const projectId = window.location.pathname.split("/project/")[1]?.split("/")[0] ?? "";

async function api(path) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res;
}

async function loadDashboard() {
  if (!projectId) return;
  const res = await api(`/api/toms/projects/${projectId}/dashboard`);
  if (!res.ok) {
    document.getElementById("dash-title").textContent = "案件が見つかりません";
    return;
  }
  const data = await res.json();
  const p = data.project;
  document.getElementById("dash-title").textContent = `${p.projectNo} ${p.title}`;
  document.getElementById("dash-state").textContent = `TOMS: ${data.tomsState} / ${p.status}`;
  document.getElementById("dash-customer").innerHTML = `
    <h2>顧客・現場</h2>
    <p>${p.customerName}<br>${p.address}<br>${p.phone}</p>
    <p>GPS: ${data.gps?.lat ?? "—"}, ${data.gps?.lng ?? "—"}</p>`;
  document.getElementById("dash-finance").innerHTML = `
    <h2>見積・請求</h2>
    <p>見積: ${data.estimate?.estimateNo ?? "—"}</p>
    <p>請求: ${data.invoice?.invoiceNo ?? "—"}</p>`;
  document.getElementById("dash-timeline").innerHTML = (data.timeline || [])
    .map(
      (e) =>
        `<li><strong>${e.title}</strong> <small>${e.createdAt}</small><br>${e.detail || ""}</li>`
    )
    .join("");
  const photos = [
    ...(data.photos?.survey || []).map((ph) => ph.url || ph.path || ""),
    ...(data.photos?.classified || []).map((ph) => ph.filePath),
  ].filter(Boolean);
  document.getElementById("dash-photos").innerHTML = photos
    .map((u) => `<img src="${u}" alt="" />`)
    .join("");
  document.getElementById("dash-links").innerHTML = `
    <h2>導線</h2>
    <p><a href="${data.links.business}">Business PWA</a> ·
    <a href="${data.links.drawing}">施工図</a> ·
    <a href="${data.links.proRemote}">PRO Remote</a></p>`;
}

loadDashboard().catch(console.error);
renderPwaTopbar("business", "案件ダッシュボード");

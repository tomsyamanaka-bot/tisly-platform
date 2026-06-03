const TOKEN_KEY = "tisly_token";
const parts = window.location.pathname.split("/");
const assetId = parts[parts.indexOf("asset") + 1] ?? "";
const qrToken = new URLSearchParams(window.location.search).get("qr");

async function load() {
  const headers = {};
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  if (qrToken) {
    const res = await fetch(`/api/toms/assets/qr/${encodeURIComponent(qrToken)}`, { headers });
    if (!res.ok) {
      document.getElementById("asset-body").textContent = "QRが無効です";
      return;
    }
    const page = await res.json();
    render(page);
    return;
  }

  if (!assetId) return;
  const res = await fetch(`/api/toms/assets/${assetId}`, { headers });
  if (!res.ok) {
    document.getElementById("asset-body").textContent = "設備が見つかりません";
    return;
  }
  const { asset } = await res.json();
  document.getElementById("asset-qr").src = `/api/toms/assets/${assetId}/qr.png`;
  document.getElementById("asset-title").textContent = asset.label;
  document.getElementById("asset-body").innerHTML = `
    <p>種別: ${asset.assetType}</p>
    <p>シリアル: ${asset.serialNumber}</p>
    <p>設置: ${asset.installDate ?? "—"}</p>
    <p>保証: ${asset.warrantyUntil ?? "—"}</p>
    <p>保守: ${asset.maintenanceUntil ?? "—"}</p>
    ${asset.projectId ? `<p><a href="/project/${asset.projectId}">案件へ</a></p>` : ""}`;
}

function render(page) {
  const a = page.asset;
  document.getElementById("asset-title").textContent = a.label;
  document.getElementById("asset-body").innerHTML = `
    <p>${a.assetType} · ${a.serialNumber}</p>
    <h3>履歴</h3>
    <ul>${(page.history || [])
      .map((e) => `<li>${e.title} (${e.createdAt})</li>`)
      .join("")}</ul>
    <h3>図面 (${(page.drawings || []).length})</h3>
    <h3>施工写真 (${(page.photos || []).length})</h3>`;
}

load().catch(console.error);

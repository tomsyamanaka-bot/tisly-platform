const statsEl = document.getElementById("stats");
const tableWrap = document.getElementById("table-wrap");
const customerCodeInput = document.getElementById("customer-code");
const propertyQueryInput = document.getElementById("property-query");

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;z-index:9999;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

async function copyUrl(url, btn) {
  try {
    await navigator.clipboard.writeText(new URL(url, location.origin).href);
    btn.classList.add("copied");
    btn.textContent = "コピー済";
    toast("URLをコピーしました");
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.textContent = btn.dataset.label || "コピー";
    }, 1500);
  } catch {
    toast("コピーに失敗しました");
  }
}

function renderStats(stats) {
  statsEl.innerHTML = `
    <div class="stat"><span>Customer</span><strong>${stats.customerMasterCount ?? 0}</strong></div>
    <div class="stat"><span>Property</span><strong>${stats.propertyCount ?? 0}</strong></div>
    <div class="stat"><span>Document</span><strong>${stats.documentCount ?? 0}</strong></div>
  `;
}

function renderTable(rows) {
  if (!rows.length) {
    tableWrap.innerHTML = "<p>該当データがありません</p>";
    return;
  }
  const copyBtn = (label, url) =>
    url
      ? `<button type="button" class="copy-btn" data-label="${label}" data-url="${url}">${label}</button>`
      : "";
  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Property</th>
          <th>shareId</th>
          <th>projectRef</th>
          <th>URLコピー</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td data-label="Customer">${escapeHtml(r.customerCode)}<br/><small>${escapeHtml(r.customerName)}</small></td>
            <td data-label="Property">${escapeHtml(r.propertyName)}<br/><small>${escapeHtml(r.propertyId)}</small></td>
            <td data-label="shareId"><code>${escapeHtml(r.shareId || "—")}</code></td>
            <td data-label="projectRef"><code>${escapeHtml(r.projectRef || "—")}</code></td>
            <td data-label="URL">
              <div class="url-cell">
                ${copyBtn("customer", r.urls.customer)}
                ${copyBtn("project", r.urls.project)}
                ${copyBtn("document", r.urls.document)}
                ${copyBtn("monitor", r.urls.monitoring)}
              </div>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  tableWrap.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyUrl(btn.dataset.url, btn));
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function load() {
  const params = new URLSearchParams();
  const code = customerCodeInput.value.trim();
  const pq = propertyQueryInput.value.trim();
  if (code) params.set("customerCode", code);
  if (pq) params.set("propertyQuery", pq);
  const res = await fetch(`/api/customer-portal/v1/admin/list?${params}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    tableWrap.innerHTML = `<p>読み込みエラー: ${escapeHtml(data.error || res.status)}</p>`;
    return;
  }
  renderStats(data.stats || {});
  renderTable(data.customers || []);
}

document.getElementById("btn-search")?.addEventListener("click", load);
document.getElementById("btn-reset")?.addEventListener("click", () => {
  customerCodeInput.value = "";
  propertyQueryInput.value = "";
  load();
});
customerCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") load();
});
propertyQueryInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") load();
});

load().catch((e) => {
  tableWrap.innerHTML = `<p>読み込み失敗: ${escapeHtml(e.message)}</p>`;
});

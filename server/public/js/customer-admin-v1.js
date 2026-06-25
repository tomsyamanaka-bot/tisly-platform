const statsEl = document.getElementById("stats");
const tableWrap = document.getElementById("table-wrap");
const customerCodeInput = document.getElementById("customer-code");
const propertyQueryInput = document.getElementById("property-query");
const editPanel = document.getElementById("edit-panel");
const uploadPanel = document.getElementById("upload-panel");

let rowsCache = [];
let plansCache = [];

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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function planOptions(selected) {
  return (plansCache.length ? plansCache : ["Free", "Notify", "Standard", "PRO", "Enterprise"])
    .map((p) => `<option value="${escapeHtml(p)}" ${p === selected ? "selected" : ""}>${escapeHtml(p)}</option>`)
    .join("");
}

function showEdit(row) {
  editPanel.hidden = false;
  editPanel.innerHTML = `
    <h2>編集 — ${escapeHtml(row.propertyName)}</h2>
    <form id="edit-form" class="edit-form">
      <label>Customer名<input name="customerName" value="${escapeHtml(row.customerName)}" /></label>
      <label>Property名<input name="propertyName" value="${escapeHtml(row.propertyName)}" /></label>
      <label>住所<input name="address" value="${escapeHtml(row.address)}" /></label>
      <label>電話<input name="contactPhone" value="${escapeHtml(row.contactPhone)}" /></label>
      <label>メール<input name="contactEmail" value="${escapeHtml(row.contactEmail)}" /></label>
      <label>契約プラン<select name="plan">${planOptions(row.plan)}</select></label>
      <label>設置日<input type="date" name="installedDate" value="${escapeHtml((row.installedDate || "").slice(0, 10))}" /></label>
      <label>点検日<input type="date" name="nextInspectionDate" value="${escapeHtml((row.nextInspectionDate || "").slice(0, 10))}" /></label>
      <div class="edit-actions">
        <button type="submit" class="primary">保存</button>
        <button type="button" id="btn-cancel-edit">キャンセル</button>
      </div>
    </form>
  `;
  document.getElementById("btn-cancel-edit")?.addEventListener("click", () => {
    editPanel.hidden = true;
  });
  document.getElementById("edit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await fetch(`/api/customer-portal/v1/admin/customer/${encodeURIComponent(row.customerCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: fd.get("customerName"),
        contactPhone: fd.get("contactPhone"),
        contactEmail: fd.get("contactEmail"),
        plan: fd.get("plan"),
      }),
    });
    await fetch(`/api/customer-portal/v1/admin/property/${encodeURIComponent(row.propertyId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyName: fd.get("propertyName"),
        address: fd.get("address"),
        installedDate: fd.get("installedDate") || null,
        nextInspectionDate: fd.get("nextInspectionDate") || null,
      }),
    });
    toast("保存しました");
    editPanel.hidden = true;
    load();
  });

  uploadPanel.hidden = false;
  uploadPanel.innerHTML = `
    <h2>ファイルアップロード</h2>
    <form id="upload-form">
      <label>種別
        <select name="fileType">
          <option value="photo">写真</option>
          <option value="drawing">図面</option>
          <option value="specification_file">仕様書</option>
          <option value="estimate">見積PDF</option>
          <option value="invoice">請求PDF</option>
          <option value="completion">完了報告PDF</option>
        </select>
      </label>
      <label>ファイル（複数可）<input type="file" name="files" multiple accept="image/*,.pdf" /></label>
      <button type="submit" class="primary">アップロード</button>
    </form>
  `;
  document.getElementById("upload-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const fileList = fd.getAll("files").filter((f) => f instanceof File && f.size > 0);
    if (!fileList.length) {
      toast("ファイルを選択してください");
      return;
    }
    const files = await Promise.all(
      fileList.map(async (file) => ({
        fileName: file.name,
        fileBase64: await fileToBase64(file),
      }))
    );
    const res = await fetch("/api/customer-portal/v1/admin/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerCode: row.customerCode,
        propertyId: row.propertyId,
        projectRef: row.projectRef,
        fileType: fd.get("fileType"),
        files,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "アップロード失敗");
      return;
    }
    toast(`${data.saved?.length ?? 0}件アップロードしました`);
    load();
  });
}

function renderTable(rows) {
  rowsCache = rows;
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
          <th>プラン</th>
          <th>shareId</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td data-label="Customer">${escapeHtml(r.customerCode)}<br/><small>${escapeHtml(r.customerName)}</small></td>
            <td data-label="Property">${escapeHtml(r.propertyName)}<br/><small>${escapeHtml(r.address || "")}</small></td>
            <td data-label="Plan">${escapeHtml(r.plan || "—")}</td>
            <td data-label="shareId"><code>${escapeHtml(r.shareId || "—")}</code></td>
            <td data-label="操作">
              <div class="url-cell">
                <button type="button" class="edit-btn" data-id="${escapeHtml(r.propertyId)}">編集</button>
                ${copyBtn("customer", r.urls.customer)}
                ${copyBtn("project", r.urls.project)}
                ${copyBtn("document", r.urls.document)}
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
  tableWrap.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rowsCache.find((r) => r.propertyId === btn.dataset.id);
      if (row) showEdit(row);
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      resolve(dataUrl.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function loadPlans() {
  const res = await fetch("/api/customer-portal/v1/admin/plans", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  plansCache = data.plans || [];
}

async function load() {
  await loadPlans();
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
  editPanel.hidden = true;
  uploadPanel.hidden = true;
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

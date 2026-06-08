import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";

const API = "/api/estimate/v1";
let currentProjectId = null;
let currentLines = [];

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function yen(n) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showView(name) {
  $("view-list").classList.toggle("hidden", name !== "list");
  $("view-detail").classList.toggle("hidden", name !== "detail");
  $("btn-back").classList.toggle("hidden", name === "list");
  $("page-title").textContent = name === "detail" ? "見積詳細" : "見積案件";
}

function renderPendingList(surveys) {
  const el = $("pending-list");
  if (!surveys.length) {
    el.className = "empty";
    el.innerHTML = "<p>見積待ちの現調案件はありません</p><p>現調PWA v1 で「見積へ渡す」を実行してください</p>";
    return;
  }
  el.className = "";
  el.innerHTML = surveys
    .map(
      (s) => `
    <div class="card list-item" data-survey-id="${s.surveyProjectId}" data-has-estimate="${s.hasEstimate ? "1" : "0"}" data-biz-id="${s.businessProjectId || ""}">
      <span class="badge pending">見積待ち</span>
      <h2 style="margin:0.4rem 0;font-size:1rem;">${escapeHtml(s.customerName)}</h2>
      <p style="margin:0;color:var(--muted);font-size:0.85rem;">
        ${escapeHtml(s.projectNo || s.surveyProjectId)} · 部材${s.materialCount} · 写真${s.photoCount}
      </p>
      <p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--blue);">
        ${s.hasEstimate ? "見積作成済 → タップで開く" : "タップして見積を作成"}
      </p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-item").forEach((node) => {
    node.addEventListener("click", () => onPendingClick(node));
  });
}

function renderProjectList(projects) {
  const el = $("project-list");
  if (!projects.length) {
    el.className = "empty";
    el.innerHTML = "<p>見積案件がありません</p>";
    return;
  }
  el.className = "";
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="card list-item" data-id="${p.businessProjectId}">
      <span class="badge ${p.pdfPath ? "done" : ""}">${p.estimateNo || "下書き"}</span>
      <h2 style="margin:0.4rem 0;font-size:1rem;">${escapeHtml(p.customerName)}</h2>
      <p style="margin:0;color:var(--muted);font-size:0.85rem;">
        ${escapeHtml(p.projectNo)} · ${p.total != null ? yen(p.total) : "—"}
      </p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-item").forEach((node) => {
    node.addEventListener("click", () => openDetail(node.dataset.id));
  });
}

async function onPendingClick(node) {
  const surveyId = node.dataset.surveyId;
  const hasEstimate = node.dataset.hasEstimate === "1";
  const bizId = node.dataset.bizId;
  try {
    if (hasEstimate && bizId) {
      await openDetail(bizId);
      return;
    }
    toast("見積を作成中…");
    const created = await api(`/from-survey/${surveyId}`, { method: "POST", body: "{}" });
    toast("見積を作成しました");
    await openDetail(created.businessProjectId);
    await loadPending();
    await loadProjects();
  } catch (e) {
    toast(e.message);
  }
}

function renderLines(items) {
  currentLines = (items || []).map((it) => ({ ...it }));
  const el = $("line-list");
  if (!currentLines.length) {
    el.innerHTML = '<p style="color:var(--muted);">明細なし</p>';
    return;
  }
  el.innerHTML = currentLines
    .map(
      (it, i) => `
    <div class="line-row" data-idx="${i}">
      <div class="name">${escapeHtml(it.name)} <span style="color:var(--muted);font-weight:400;">(${escapeHtml(it.category)})</span></div>
      <div>
        <label>数量</label>
        <input type="number" min="1" class="qty-input" data-idx="${i}" value="${it.quantity}" inputmode="numeric" />
      </div>
      <div>
        <label>単価</label>
        <input type="number" min="0" class="price-input" data-idx="${i}" value="${it.unitPrice}" inputmode="numeric" />
      </div>
    </div>`
    )
    .join("");
  el.querySelectorAll(".qty-input, .price-input").forEach((inp) => {
    inp.addEventListener("change", () => recalcLocal());
  });
}

function recalcLocal() {
  $("line-list").querySelectorAll(".line-row").forEach((row) => {
    const i = Number(row.dataset.idx);
    const qty = Number(row.querySelector(".qty-input")?.value || 1);
    const price = Number(row.querySelector(".price-input")?.value || 0);
    if (currentLines[i]) {
      currentLines[i].quantity = qty;
      currentLines[i].unitPrice = price;
      currentLines[i].amount = Math.round(qty * price);
    }
  });
  const subtotal = currentLines.reduce((s, it) => s + (it.amount || 0), 0);
  const tax = Math.round(subtotal * 0.1);
  $("total-sub").textContent = yen(subtotal);
  $("total-tax").textContent = yen(tax);
  $("total-grand").textContent = yen(subtotal + tax);
}

function updateTotalsFromEstimate(est) {
  if (!est) return;
  $("total-sub").textContent = yen(est.subtotal);
  $("total-tax").textContent = yen(est.tax);
  $("total-grand").textContent = yen(est.total);
}

async function openDetail(projectId) {
  currentProjectId = projectId;
  showView("detail");
  $("toms-preview").classList.add("hidden");
  try {
    const p = await api(`/projects/${projectId}`);
    $("detail-name").textContent = p.customerName || p.title;
    const statusEl = $("detail-status");
    if (p.pdfPath) {
      statusEl.textContent = "PDF生成済";
      statusEl.className = "badge done";
      $("link-pdf").href = `/api/estimate/v1/projects/${projectId}/pdf`;
      $("link-pdf").classList.remove("hidden");
    } else {
      statusEl.textContent = p.estimate ? "下書き" : "未作成";
      statusEl.className = "badge pending";
      $("link-pdf").classList.add("hidden");
    }
    $("detail-meta").textContent = [
      p.projectNo,
      p.estimate?.estimateNo,
      p.surveyProjectId && `現調: ${p.surveyProjectId}`,
    ]
      .filter(Boolean)
      .join(" · ");
    renderLines(p.estimate?.items || []);
    updateTotalsFromEstimate(p.estimate);
  } catch (e) {
    toast(e.message);
    showView("list");
  }
}

async function loadPending() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/pending-surveys?customerCode=${encodeURIComponent(code)}`);
    renderPendingList(data.surveys || []);
  } catch (e) {
    $("pending-list").innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  }
}

async function loadProjects() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/projects?customerCode=${encodeURIComponent(code)}`);
    renderProjectList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
  }
}

function setListTab(tab) {
  const pending = tab === "pending";
  $("tab-pending").classList.toggle("active", pending);
  $("tab-projects").classList.toggle("active", !pending);
  $("pending-list").classList.toggle("hidden", !pending);
  $("project-list").classList.toggle("hidden", pending);
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  showView("list");
  await loadPending();
  await loadProjects();

  $("tab-pending").addEventListener("click", () => setListTab("pending"));
  $("tab-projects").addEventListener("click", () => setListTab("projects"));

  $("btn-back").addEventListener("click", () => {
    showView("list");
    loadPending();
    loadProjects();
  });

  $("btn-save-items").addEventListener("click", async () => {
    if (!currentProjectId) return;
    recalcLocal();
    try {
      const result = await api(`/projects/${currentProjectId}/items`, {
        method: "PATCH",
        body: JSON.stringify({ items: currentLines }),
      });
      toast("明細を保存しました");
      updateTotalsFromEstimate(result.estimate);
      $("link-pdf").classList.add("hidden");
      $("detail-status").textContent = "下書き";
      $("detail-status").className = "badge pending";
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-finalize").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積を確定してPDFを生成しますか？")) return;
    try {
      recalcLocal();
      await api(`/projects/${currentProjectId}/items`, {
        method: "PATCH",
        body: JSON.stringify({ items: currentLines }),
      });
      const result = await api(`/projects/${currentProjectId}/finalize`, { method: "POST", body: "{}" });
      toast("PDFを生成しました");
      $("link-pdf").href = `/api/estimate/v1/projects/${currentProjectId}/pdf`;
      $("link-pdf").classList.remove("hidden");
      $("detail-status").textContent = "PDF生成済";
      $("detail-status").className = "badge done";
      updateTotalsFromEstimate(result.estimate);
      await loadProjects();
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-toms").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const data = await api(`/projects/${currentProjectId}/toms-format`);
      const pre = $("toms-preview");
      pre.textContent = JSON.stringify(data, null, 2);
      pre.classList.remove("hidden");
    } catch (e) {
      toast(e.message);
    }
  });
}

init().catch((e) => {
  console.error(e);
  $("pending-list").innerHTML = `<p class="error">初期化エラー: ${escapeHtml(e.message)}</p>`;
});

import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError, renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

let practicalNav = null;
let currentSurveyProjectId = null;
let pdfBlobUrl = null;

const API = "/api/estimate/v1";
let currentProjectId = null;
let currentLines = [];
let lastTomsData = null;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function toastError(err, status) {
  const f = friendlyHttpError(err?.message || err, status);
  toast(`${f.title} — ${f.action}`);
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

function newEmptyLine() {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: "other",
    name: "",
    unit: "式",
    quantity: 1,
    unitPrice: 0,
    amount: 0,
  };
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
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function showView(name) {
  $("view-list").classList.toggle("hidden", name !== "list");
  $("view-detail").classList.toggle("hidden", name !== "detail");
  practicalNav?.setTitle(name === "detail" ? "見積の内容" : "見積");
  practicalNav?.setBackVisible(name !== "list");
  $("page-hint").textContent =
    name === "detail" ? "部材の数量・単価を直して、見積もりを確定できます" : "お仕事の料金をまとめます";
}

function renderPendingList(surveys) {
  const el = $("pending-list");
  if (!surveys.length) {
    el.className = "empty-state";
    el.innerHTML =
      '<div class="empty-icon">💰</div><p>見積待ちの案件はありません</p><p>現調で「見積へ送る」を押すと、ここに表示されます</p>';
    return;
  }
  el.className = "";
  el.innerHTML = surveys
    .map(
      (s) => `
    <div class="friendly-card list-card" data-survey-id="${s.surveyProjectId}" data-has-estimate="${s.hasEstimate ? "1" : "0"}" data-biz-id="${s.businessProjectId || ""}">
      <span class="status-badge orange">見積待ち</span>
      <h2>${escapeHtml(s.customerName)}</h2>
      <p>${escapeHtml(s.projectNo || s.surveyProjectId)} · 部材${s.materialCount}件 · 写真${s.photoCount}枚</p>
      <p style="color:var(--tisly-blue);font-size:0.9rem;margin-top:0.35rem;">
        ${s.hasEstimate ? "タップして見積を開く" : "タップして見積を作る"}
      </p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-card").forEach((node) => {
    node.addEventListener("click", () => onPendingClick(node));
  });
}

function renderProjectList(projects) {
  const el = $("project-list");
  if (!projects.length) {
    el.className = "empty-state";
    el.innerHTML = '<div class="empty-icon">📋</div><p>まだ見積がありません</p>';
    return;
  }
  el.className = "";
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="friendly-card list-card" data-id="${p.businessProjectId}">
      <span class="status-badge ${p.pdfPath ? "done" : "orange"}">${p.pdfPath ? "見積書の準備ができました" : p.estimateNo || "下書き"}</span>
      <h2>${escapeHtml(p.customerName)}</h2>
      <p>${escapeHtml(p.projectNo)} · ${p.total != null ? yen(p.total) : "—"}</p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-card").forEach((node) => {
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
    toast("見積を作っています…");
    const created = await api(`/from-survey/${surveyId}`, { method: "POST", body: "{}" });
    toast("見積を作りました");
    await openDetail(created.businessProjectId);
    await loadPending();
    await loadProjects();
  } catch (e) {
    toastError(e, e.status);
  }
}

function bindLineInputs() {
  $("line-list").querySelectorAll(".qty-input, .price-input, .name-input").forEach((inp) => {
    inp.addEventListener("input", () => recalcLocal());
    inp.addEventListener("change", () => recalcLocal());
  });
  $("line-list").querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === "delete") {
        if (currentLines.length <= 1) {
          toast("最低1項目は残してください");
          return;
        }
        currentLines.splice(i, 1);
        renderLines(currentLines);
        return;
      }
      if (action === "up" && i > 0) {
        [currentLines[i - 1], currentLines[i]] = [currentLines[i], currentLines[i - 1]];
        renderLines(currentLines);
      }
      if (action === "down" && i < currentLines.length - 1) {
        [currentLines[i + 1], currentLines[i]] = [currentLines[i], currentLines[i + 1]];
        renderLines(currentLines);
      }
    });
  });
}

function renderLines(items) {
  currentLines = (items || []).map((it) => ({ ...it }));
  if (!currentLines.length) currentLines = [newEmptyLine()];
  const el = $("line-list");
  el.innerHTML = currentLines
    .map(
      (it, i) => `
    <div class="line-card" data-idx="${i}">
      <label class="friendly-label" style="margin:0 0 0.35rem;">項目名</label>
      <input type="text" class="name-input line-name-input" data-idx="${i}" value="${escapeHtml(it.name)}" placeholder="工事項目名" />
      <div class="line-qty-price">
        <div>
          <label class="friendly-label" style="margin:0;">数量</label>
          <input type="number" min="1" class="qty-input" data-idx="${i}" value="${it.quantity}" inputmode="numeric" />
        </div>
        <div>
          <label class="friendly-label" style="margin:0;">単価（円）</label>
          <input type="number" min="0" class="price-input" data-idx="${i}" value="${it.unitPrice}" inputmode="numeric" />
        </div>
      </div>
      <div class="line-amount">金額 ${yen((it.quantity || 0) * (it.unitPrice || 0))}</div>
      <div class="line-actions">
        <button type="button" data-action="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>↑ 上へ</button>
        <button type="button" data-action="down" data-idx="${i}" ${i === currentLines.length - 1 ? "disabled" : ""}>↓ 下へ</button>
        <button type="button" class="btn-line-delete" data-action="delete" data-idx="${i}">削除</button>
      </div>
    </div>`
    )
    .join("");
  bindLineInputs();
  recalcLocal();
}

function recalcLocal() {
  $("line-list").querySelectorAll(".line-card").forEach((row) => {
    const i = Number(row.dataset.idx);
    const qty = Number(row.querySelector(".qty-input")?.value || 1);
    const price = Number(row.querySelector(".price-input")?.value || 0);
    const name = row.querySelector(".name-input")?.value?.trim() || "";
    if (currentLines[i]) {
      currentLines[i].quantity = qty;
      currentLines[i].unitPrice = price;
      currentLines[i].name = name || currentLines[i].name;
      currentLines[i].amount = Math.round(qty * price);
      const amtEl = row.querySelector(".line-amount");
      if (amtEl) amtEl.textContent = `金額 ${yen(currentLines[i].amount)}`;
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

function hidePdfPreview() {
  $("pdf-section").classList.add("hidden");
  $("pdf-preview").src = "about:blank";
  if (pdfBlobUrl) {
    URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = null;
  }
}

async function showPdfPreview(projectId) {
  const token = getCustomerToken();
  const url = `/api/estimate/v1/projects/${projectId}/pdf`;
  try {
    toast("PDFを読み込み中…");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    }
    const blob = await res.blob();
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = URL.createObjectURL(blob);
    $("pdf-preview").src = pdfBlobUrl;
    $("link-pdf").href = `${url}?access_token=${encodeURIComponent(token)}`;
    $("pdf-section").classList.remove("hidden");
    toast("プレビューを表示しました");
  } catch (e) {
    toastError(e, e.status);
  }
}

function renderCustomerInfo(p) {
  const parts = [
    p.siteName && `現場: ${p.siteName}`,
    p.address && `工事場所: ${p.address}`,
    p.contactName && `担当: ${p.contactName}`,
    p.phone && `TEL: ${p.phone}`,
    p.email && `Email: ${p.email}`,
  ].filter(Boolean);
  $("detail-customer-info").innerHTML = parts.map((x) => escapeHtml(x)).join(" · ");
}

async function openDetail(projectId) {
  currentProjectId = projectId;
  showView("detail");
  $("toms-section").classList.add("hidden");
  lastTomsData = null;
  try {
    const p = await api(`/projects/${projectId}`);
    $("detail-name").textContent = p.customerName || p.title;
    renderCustomerInfo(p);
    const statusEl = $("detail-status");
    if (p.pdfPath) {
      statusEl.textContent = "見積書の準備ができました";
      statusEl.className = "status-badge done";
      await showPdfPreview(projectId);
    } else {
      statusEl.textContent = p.estimate ? "下書き" : "未作成";
      statusEl.className = "status-badge orange";
      hidePdfPreview();
    }
    currentSurveyProjectId = p.surveyProjectId || null;
    const metaParts = [p.projectNo, p.estimate?.estimateNo].filter(Boolean);
    if (p.surveyProjectId) {
      metaParts.push(
        `<a href="/survey-v1?project=${encodeURIComponent(p.surveyProjectId)}" style="color:var(--tisly-blue)">← 現調の内容を見る</a>`
      );
    }
    $("detail-meta").innerHTML = metaParts.join(" · ");
    $("estimate-notes").value = p.estimateNotes || "";
    renderLines(p.estimate?.items || []);
    updateTotalsFromEstimate(p.estimate);
  } catch (e) {
    toastError(e, e.status);
    showView("list");
  }
}

async function saveItems() {
  recalcLocal();
  return api(`/projects/${currentProjectId}/items`, {
    method: "PATCH",
    body: JSON.stringify({
      items: currentLines,
      notes: $("estimate-notes").value.trim(),
    }),
  });
}

async function loadPending() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/pending-surveys?customerCode=${encodeURIComponent(code)}`);
    renderPendingList(data.surveys || []);
  } catch (e) {
    $("pending-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function loadProjects() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/projects?customerCode=${encodeURIComponent(code)}`);
    renderProjectList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
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
  practicalNav = initPracticalNav({
    appId: "estimate_v1",
    appName: "見積",
    theme: "blue",
    onBack: () => {
      showView("list");
      loadPending();
      loadProjects();
    },
  });
  practicalNav.setToast(toast);
  showView("list");
  await loadPending();
  await loadProjects();

  $("tab-pending").addEventListener("click", () => setListTab("pending"));
  $("tab-projects").addEventListener("click", () => setListTab("projects"));

  $("btn-add-line").addEventListener("click", () => {
    currentLines.push(newEmptyLine());
    renderLines(currentLines);
  });

  $("btn-save-items").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const result = await saveItems();
      toast("内訳を保存しました");
      updateTotalsFromEstimate(result.estimate);
      hidePdfPreview();
      $("detail-status").textContent = "下書き";
      $("detail-status").className = "status-badge orange";
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-preview-pdf").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await saveItems();
      await showPdfPreview(currentProjectId);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-finalize").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積を確定しますか？\n確定すると見積書（PDF）が作れます。")) return;
    try {
      await saveItems();
      const result = await api(`/projects/${currentProjectId}/finalize`, { method: "POST", body: "{}" });
      toast("見積を確定しました");
      await showPdfPreview(currentProjectId);
      $("detail-status").textContent = "見積書の準備ができました";
      $("detail-status").className = "status-badge done";
      updateTotalsFromEstimate(result.estimate);
      await loadProjects();
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-toms").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const data = await api(`/projects/${currentProjectId}/toms-format`);
      lastTomsData = data;
      $("toms-preview").textContent = JSON.stringify(data, null, 2);
      $("toms-section").classList.remove("hidden");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-toms-download").addEventListener("click", async () => {
    if (!lastTomsData) return;
    const text = JSON.stringify(lastTomsData, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  });
}

init().catch((e) => {
  console.error(e);
  $("pending-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
});

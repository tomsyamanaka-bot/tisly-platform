import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

let practicalNav = null;
let currentSurveyProjectId = null;

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
      '<div class="empty-icon">💰</div><p>見積もり作成待ちの案件はありません</p><p>現調アプリで「見積へ送る」を押すと、ここに表示されます</p>';
    return;
  }
  el.className = "";
  el.innerHTML = surveys
    .map(
      (s) => `
    <div class="friendly-card list-card" data-survey-id="${s.surveyProjectId}" data-has-estimate="${s.hasEstimate ? "1" : "0"}" data-biz-id="${s.businessProjectId || ""}">
      <span class="status-badge orange">見積もり作成待ち</span>
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
    toast(e.message);
  }
}

function renderLines(items) {
  currentLines = (items || []).map((it) => ({ ...it }));
  const el = $("line-list");
  if (!currentLines.length) {
    el.innerHTML = '<p style="color:var(--tisly-muted);">まだ内訳がありません</p>';
    return;
  }
  el.innerHTML = currentLines
    .map(
      (it, i) => `
    <div class="line-card" data-idx="${i}">
      <div style="font-weight:600;margin-bottom:0.35rem;">🔧 ${escapeHtml(it.name)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <div>
          <label class="friendly-label" style="margin:0;">数量</label>
          <input type="number" min="1" class="qty-input" data-idx="${i}" value="${it.quantity}" inputmode="numeric" />
        </div>
        <div>
          <label class="friendly-label" style="margin:0;">単価</label>
          <input type="number" min="0" class="price-input" data-idx="${i}" value="${it.unitPrice}" inputmode="numeric" />
        </div>
      </div>
    </div>`
    )
    .join("");
  el.querySelectorAll(".qty-input, .price-input").forEach((inp) => {
    inp.addEventListener("change", () => recalcLocal());
  });
}

function recalcLocal() {
  $("line-list").querySelectorAll(".line-card").forEach((row) => {
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

function showPdfPreview(projectId) {
  const url = `/api/estimate/v1/projects/${projectId}/pdf`;
  $("pdf-preview").src = url;
  $("link-pdf").href = url;
  $("pdf-section").classList.remove("hidden");
}

function hidePdfPreview() {
  $("pdf-section").classList.add("hidden");
  $("pdf-preview").src = "about:blank";
}

async function openDetail(projectId) {
  currentProjectId = projectId;
  showView("detail");
  $("toms-section").classList.add("hidden");
  lastTomsData = null;
  try {
    const p = await api(`/projects/${projectId}`);
    $("detail-name").textContent = p.customerName || p.title;
    const statusEl = $("detail-status");
    if (p.pdfPath) {
      statusEl.textContent = "見積書の準備ができました";
      statusEl.className = "status-badge done";
      showPdfPreview(projectId);
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
    $("pending-list").innerHTML = `<div class="error-friendly"><strong>読み込めませんでした</strong>もう一度開き直してください。<br><small>${escapeHtml(e.message)}</small></div>`;
  }
}

async function loadProjects() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/projects?customerCode=${encodeURIComponent(code)}`);
    renderProjectList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly"><strong>読み込めませんでした</strong><br><small>${escapeHtml(e.message)}</small></div>`;
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

  $("btn-save-items").addEventListener("click", async () => {
    if (!currentProjectId) return;
    recalcLocal();
    try {
      const result = await api(`/projects/${currentProjectId}/items`, {
        method: "PATCH",
        body: JSON.stringify({ items: currentLines }),
      });
      toast("内訳を保存しました");
      updateTotalsFromEstimate(result.estimate);
      hidePdfPreview();
      $("detail-status").textContent = "下書き";
      $("detail-status").className = "status-badge orange";
    } catch (e) {
      toast(e.message);
    }
  });

  $("btn-finalize").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積もりを確定しますか？\n確定すると見積書が作れます。")) return;
    try {
      recalcLocal();
      await api(`/projects/${currentProjectId}/items`, {
        method: "PATCH",
        body: JSON.stringify({ items: currentLines }),
      });
      const result = await api(`/projects/${currentProjectId}/finalize`, { method: "POST", body: "{}" });
      toast("見積もりを確定しました");
      showPdfPreview(currentProjectId);
      $("detail-status").textContent = "見積書の準備ができました";
      $("detail-status").className = "status-badge done";
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
      lastTomsData = data;
      $("toms-preview").textContent = JSON.stringify(data, null, 2);
      $("toms-section").classList.remove("hidden");
    } catch (e) {
      toast(e.message);
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
  $("pending-list").innerHTML = `<div class="error-friendly"><strong>起動できませんでした</strong>ログインし直してください。<br><small>${escapeHtml(e.message)}</small></div>`;
});

import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError, renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import { confirmChecklistBeforeReport } from "./field-checklist-ui.js";

let practicalNav = null;
let currentSurveyProjectId = null;
let pdfBlobUrl = null;

const API = "/api/estimate/v1";
const WORK_API = "/api/work-session/v1";
let currentProjectId = null;
let currentLines = [];
let currentCustomerName = "";
let priceRulePresets = [];
let currentPriceRule = null;
let lastTomsData = null;
let hasInvoice = false;
let standaloneMode = "estimate";
let lineTemplates = [];
let customerSuggestTimer = null;
let completionPhotos = [];
let completionPendingPreviewUrls = [];
const completionTitleTimers = new Map();
const completionTitleLastSaved = new Map();
const COMPLETION_TITLE_SAVE_OK = "タイトルを保存しました";
const MAX_COMPLETION_PHOTOS = 30;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const COMPLETION_PHOTO_FAIL_MSG = "写真の形式か容量で失敗しました。別の写真で試してください";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function toastError(err, status) {
  const f = friendlyHttpError(err?.message || err, status);
  if (status === 401 || /unauthorized/i.test(String(err?.message || ""))) {
    toast("ログインが切れました。もう一度ログインしてください");
    return;
  }
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
    memo: "",
    unit: "式",
    quantity: 1,
    unitPrice: 0,
    amount: 0,
    orderTarget: false,
  };
}

const LINE_FIELD_ORDER = ["desc", "qty", "price"];

function focusLineField(rowIdx, fieldName) {
  const row = $("line-list")?.querySelector(`.line-item-card[data-idx="${rowIdx}"]`);
  if (!row) return false;
  const el = row.querySelector(`[data-field="${fieldName}"]`);
  if (!el) return false;
  el.focus();
  if (el.select) el.select();
  return true;
}

function splitDescription(name, memo) {
  const n = String(name || "").trim();
  const m = String(memo || "").trim();
  if (n && m) return `${n}\n${m}`;
  return n || m;
}

function parseDescription(text) {
  const lines = String(text || "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return { name: "", memo: "" };
  if (lines.length === 1) return { name: lines[0], memo: "" };
  return { name: lines[0], memo: lines.slice(1).join("\n") };
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
      <p>${escapeHtml(s.projectNo || s.surveyProjectId)}</p>
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

function renderInvoiceList(projects) {
  const el = $("invoice-list");
  if (!el) return;
  if (!projects.length) {
    el.className = "empty-state";
    el.innerHTML = '<div class="empty-icon">🧾</div><p>まだ請求書がありません</p><p>【新規請求書】から単独作成できます</p>';
    return;
  }
  el.className = "";
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="friendly-card list-card" data-id="${p.businessProjectId}">
      <span class="status-badge done">${escapeHtml(p.invoiceNo || "請求書")}</span>
      <h2>${escapeHtml(p.customerName)}</h2>
      <p>${escapeHtml(p.projectNo)} · ${p.invoiceTotal != null ? yen(p.invoiceTotal) : p.total != null ? yen(p.total) : "—"}</p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-card").forEach((node) => {
    node.addEventListener("click", () => openDetail(node.dataset.id));
  });
}

async function loadInvoices() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/invoices?customerCode=${encodeURIComponent(code)}`);
    renderInvoiceList(data.projects || []);
  } catch (e) {
    if ($("invoice-list")) {
      $("invoice-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
    }
  }
}

function refreshListTabVisibility() {
  const pending = $("tab-pending")?.classList.contains("active");
  const invoices = $("tab-invoices")?.classList.contains("active");
  $("pending-list")?.classList.toggle("hidden", !pending);
  $("project-list")?.classList.toggle("hidden", pending || invoices);
  $("invoice-list")?.classList.toggle("hidden", !invoices);
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

let pendingSurveyForEstimate = null;

function renderMaterialCandidates(groups) {
  if (!groups?.length) return "<p>候補部材はありません</p>";
  return groups
    .map(
      (g) => `<p><strong>${escapeHtml(g.label)}</strong><br>${(g.items || [])
        .map((it) => `<span class="material-chip">${escapeHtml(it)}</span>`)
        .join(" ")}</p>`
    )
    .join("");
}

async function createEstimateFromSurvey(surveyId) {
  toast("見積を作っています…");
  const created = await api(`/from-survey/${surveyId}`, { method: "POST", body: "{}" });
  toast("見積を作りました");
  $("material-candidates-panel")?.classList.add("hidden");
  pendingSurveyForEstimate = null;
  await openDetail(created.businessProjectId);
  await loadPending();
  await loadProjects();
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
    const cand = await api(`/material-candidates/${surveyId}`);
    pendingSurveyForEstimate = surveyId;
    $("material-candidates-body").innerHTML = renderMaterialCandidates(cand.groups);
    $("material-candidates-panel").classList.remove("hidden");
    $("pending-list").classList.add("hidden");
  } catch (e) {
    toastError(e, e.status);
  }
}

function bindLineInputs() {
  $("line-list").querySelectorAll(".qty-input, .price-input, .desc-input, .order-target-input").forEach((inp) => {
    inp.addEventListener("input", () => recalcLocal());
    inp.addEventListener("change", () => recalcLocal());
  });
  $("line-list").querySelectorAll(".line-field-input").forEach((inp) => {
    inp.addEventListener("keydown", (ev) => {
      const field = inp.dataset.field;
      const idx = Number(inp.dataset.idx);
      if (ev.key === "Tab" && !ev.shiftKey) {
        const pos = LINE_FIELD_ORDER.indexOf(field);
        if (pos >= 0 && pos < LINE_FIELD_ORDER.length - 1) {
          ev.preventDefault();
          focusLineField(idx, LINE_FIELD_ORDER[pos + 1]);
          return;
        }
        if (pos === LINE_FIELD_ORDER.length - 1 && idx < currentLines.length - 1) {
          ev.preventDefault();
          focusLineField(idx + 1, LINE_FIELD_ORDER[0]);
        }
      }
      if (ev.key === "Enter" && !ev.shiftKey && field !== "desc") {
        ev.preventDefault();
        const pos = LINE_FIELD_ORDER.indexOf(field);
        if (pos >= 0 && pos < LINE_FIELD_ORDER.length - 1) {
          focusLineField(idx, LINE_FIELD_ORDER[pos + 1]);
          return;
        }
        if (idx === currentLines.length - 1) {
          currentLines.push(newEmptyLine());
          renderLines(currentLines);
          focusLineField(currentLines.length - 1, LINE_FIELD_ORDER[0]);
          return;
        }
        focusLineField(idx + 1, LINE_FIELD_ORDER[0]);
      }
    });
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
  currentLines = (items || []).map((it) => ({ ...it, orderTarget: it.orderTarget === true }));
  if (!currentLines.length) currentLines = [newEmptyLine()];
  const el = $("line-list");
  el.innerHTML = currentLines
    .map(
      (it, i) => `
    <div class="line-item-card line-card" data-idx="${i}">
      <label class="friendly-label line-field-label">項目名</label>
      <textarea class="desc-input line-field-input" data-field="desc" data-idx="${i}" rows="3" placeholder="例：防犯カメラ&#10;LAN配線工事">${escapeHtml(splitDescription(it.name, it.memo))}</textarea>
      <div class="line-metrics-grid">
        <div class="line-metric col-qty">
          <label class="friendly-label line-metric-label">数量</label>
          <input type="number" min="0" step="1" class="qty-input line-field-input" data-field="qty" data-idx="${i}" value="${it.quantity}" inputmode="numeric" />
        </div>
        <div class="line-metric col-price">
          <label class="friendly-label line-metric-label">単価</label>
          <input type="number" min="0" class="price-input line-field-input" data-field="price" data-idx="${i}" value="${it.unitPrice}" inputmode="numeric" />
        </div>
        <div class="line-metric col-amount">
          <span class="line-metric-label">金額</span>
          <div class="line-amount-display">${yen((it.quantity || 0) * (it.unitPrice || 0))}</div>
        </div>
      </div>
      <label class="line-order-target"><input type="checkbox" class="order-target-input" data-idx="${i}" ${it.orderTarget ? "checked" : ""} /> 発注対象</label>
      <div class="line-actions">
        <button type="button" data-action="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-action="down" data-idx="${i}" ${i === currentLines.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn-line-delete" data-action="delete" data-idx="${i}">削除</button>
      </div>
    </div>`
    )
    .join("");
  bindLineInputs();
  recalcLocal();
}

function readShuseiDiscount() {
  return Math.max(0, Math.round(Number($("shusei-discount")?.value || 0)));
}

function recalcLocal() {
  $("line-list").querySelectorAll(".line-item-card").forEach((row) => {
    const i = Number(row.dataset.idx);
    const qty = Number(row.querySelector(".qty-input")?.value || 1);
    const price = Number(row.querySelector(".price-input")?.value || 0);
    const desc = row.querySelector(".desc-input")?.value || "";
    const orderTarget = row.querySelector(".order-target-input")?.checked === true;
    const parsed = parseDescription(desc);
    if (currentLines[i]) {
      currentLines[i].quantity = qty;
      currentLines[i].unitPrice = price;
      currentLines[i].name = parsed.name;
      currentLines[i].memo = parsed.memo;
      currentLines[i].orderTarget = orderTarget;
      currentLines[i].amount = Math.round(qty * price);
      const amtEl = row.querySelector(".line-amount-display");
      if (amtEl) amtEl.textContent = yen(currentLines[i].amount);
    }
  });
  const lineSubtotal = currentLines.reduce((s, it) => s + (it.amount || 0), 0);
  const discount = readShuseiDiscount();
  const subtotal = Math.max(0, lineSubtotal - discount);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const showDiscount = discount > 0;
  $("total-line-row")?.classList.toggle("hidden", !showDiscount);
  $("total-discount-row")?.classList.toggle("hidden", !showDiscount);
  if ($("total-line")) $("total-line").textContent = yen(lineSubtotal);
  if ($("total-discount")) $("total-discount").textContent = `-${yen(discount)}`;
  $("total-sub").textContent = yen(subtotal);
  $("total-tax").textContent = yen(tax);
  $("total-grand").textContent = yen(total);
  renderShuseiPreview();
  if (currentPriceRule) renderPriceRuleSummary(readSelectedPriceRule(), { shuseiDiscount: discount });
}

function updateTotalsFromEstimate(est) {
  if (!est) return;
  if ($("shusei-discount")) $("shusei-discount").value = String(est.shuseiDiscount ?? 0);
  if ($("shusei-discount-memo")) $("shusei-discount-memo").value = est.shuseiDiscountMemo ?? "";
  recalcLocal();
}

function hidePdfPreview() {
  $("pdf-section").classList.add("hidden");
  $("pdf-preview").src = "about:blank";
  $("pdf-error").classList.remove("visible");
  $("pdf-error").innerHTML = "";
  if (pdfBlobUrl) {
    URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = null;
  }
}

function fillHeaderForm(header) {
  if (!header) return;
  $("hdr-addressee").value = header.addressee || "";
  $("hdr-subject").value = header.subject || "";
  $("hdr-issue-date").value = header.issueDate || "";
  $("hdr-estimate-no").value = header.estimateNo || "";
  $("hdr-staff").value = header.staffName || "";
  $("hdr-work-location").value = header.workLocation || header.siteName || "";
  $("hdr-address").value = header.address || "";
  $("hdr-phone").value = header.phone || "";
  $("hdr-email").value = header.email || "";
  if ($("hdr-notes")) $("hdr-notes").value = header.notes || "";
}

function fillInvoiceHeaderForm(project, invoice) {
  $("invoice-header-fields")?.classList.toggle("hidden", !invoice);
  if (!invoice) return;
  if ($("hdr-invoice-date")) {
    $("hdr-invoice-date").value = (invoice.createdAt || "").slice(0, 10) || todayIsoDate();
  }
  if ($("hdr-payment-due")) {
    $("hdr-payment-due").value = invoice.paymentDueDate || project?.paymentDueDate || "";
  }
}

function readHeaderForm() {
  return {
    addressee: $("hdr-addressee").value.trim(),
    subject: $("hdr-subject").value.trim(),
    issueDate: $("hdr-issue-date").value.trim(),
    estimateNo: $("hdr-estimate-no").value.trim(),
    staffName: $("hdr-staff").value.trim(),
    workLocation: $("hdr-work-location").value.trim(),
    address: $("hdr-address").value.trim(),
    phone: $("hdr-phone").value.trim(),
    email: $("hdr-email").value.trim(),
  };
}

async function saveHeader() {
  return api(`/projects/${currentProjectId}/header`, {
    method: "PATCH",
    body: JSON.stringify(readHeaderForm()),
  });
}

function buildPdfUrl(kind) {
  if (kind === "completion") {
    return `/api/estimate/v1/projects/${currentProjectId}/completion-report/pdf`;
  }
  if (kind === "specification") {
    return `/api/estimate/v1/projects/${currentProjectId}/specification/pdf`;
  }
  return kind === "invoice"
    ? `/api/estimate/v1/projects/${currentProjectId}/invoice/pdf`
    : `/api/estimate/v1/projects/${currentProjectId}/pdf`;
}

function buildPdfTabUrl(kind, token) {
  const url = buildPdfUrl(kind);
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

const PDF_LABELS = {
  estimate: "見積書",
  invoice: "請求書",
  specification: "仕様書",
  completion: "完了報告書",
};

const DOC_VIEWER_KINDS = {
  estimate: "estimate",
  invoice: "invoice",
  specification: "specification",
  completion: "completion-report",
};

function buildDocumentViewerUrl(kind) {
  const viewerKind = DOC_VIEWER_KINDS[kind] || kind;
  const params = new URLSearchParams({
    projectId: currentProjectId,
    kind: viewerKind,
    return: `${window.location.pathname}${window.location.search}`,
  });
  return `/document-viewer-v1.html?${params}`;
}

async function openDocumentViewer(kind) {
  if (!currentProjectId) return;
  if (kind === "invoice" && !hasInvoice) {
    toast("先に請求書を作成してください");
    return;
  }
  try {
    if (kind === "estimate" || kind === "invoice") {
      await saveHeader().catch(() => ({}));
      await saveItems().catch(() => ({}));
    }
    window.location.href = buildDocumentViewerUrl(kind);
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

function isLaborLineName(name, category) {
  if (category === "labor") return true;
  return /労務|工事|設置|配線/.test(String(name || ""));
}

function isPriceRuleTargetLineLocal(item) {
  const baseCost = item.costPrice ?? 0;
  if (baseCost <= 0) return false;
  if (isLaborLineName(item.name, item.category)) return true;
  if (item.category === "other") return false;
  return true;
}

function expectedUnitPriceLocal(item, rule) {
  if (!rule || rule.ruleName === "手動調整") return null;
  if (!isPriceRuleTargetLineLocal(item)) return null;
  const baseCost = item.costPrice ?? 0;
  const mult = isLaborLineName(item.name, item.category) ? rule.laborMultiplier : rule.costMultiplier;
  return Math.round(baseCost * mult);
}

function readMultiplierInputs() {
  const cost = Number($("cost-multiplier")?.value);
  const labor = Number($("labor-multiplier")?.value);
  return {
    costMultiplier: Number.isFinite(cost) && cost > 0 ? cost : null,
    laborMultiplier: Number.isFinite(labor) && labor > 0 ? labor : null,
  };
}

function syncMultiplierInputsFromRule(rule, preset) {
  const costEl = $("cost-multiplier");
  const laborEl = $("labor-multiplier");
  const isManual = preset?.ruleName === "手動調整" || rule?.ruleName === "手動調整";
  const costVal = preset?.costMultiplier ?? rule?.costMultiplier ?? "";
  const laborVal = preset?.laborMultiplier ?? rule?.laborMultiplier ?? "";
  if (costEl) {
    costEl.disabled = isManual;
    costEl.value = isManual ? "" : String(costVal);
  }
  if (laborEl) {
    laborEl.disabled = isManual;
    laborEl.value = isManual ? "" : String(laborVal);
  }
}

function findPresetByRuleName(ruleName) {
  return priceRulePresets.find((p) => p.ruleName === ruleName);
}

function matchPresetOption(rule) {
  if (!rule) return priceRulePresets.find((p) => p.id === "manual") || null;
  const exact = findPresetByRuleName(rule.ruleName);
  if (exact) return exact;
  return priceRulePresets.find((p) => p.id === "manual") || null;
}

function populatePriceRuleSelect(rule) {
  const sel = $("price-rule-select");
  if (!sel) return;
  if (!priceRulePresets.length) {
    sel.innerHTML = '<option value="">読み込み中…</option>';
    return;
  }
  sel.innerHTML = priceRulePresets
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`)
    .join("");
  const matched = matchPresetOption(rule);
  if (matched) sel.value = matched.id;
  syncMultiplierInputsFromRule(rule, matched);
}

function readSelectedPriceRule() {
  const sel = $("price-rule-select");
  const preset = priceRulePresets.find((p) => p.id === sel?.value);
  if (!preset) return currentPriceRule;
  if (preset.ruleName === "手動調整") {
    return { ruleName: "手動調整", costMultiplier: null, laborMultiplier: null };
  }
  const mult = readMultiplierInputs();
  return {
    ruleName: preset.ruleName,
    costMultiplier: mult.costMultiplier ?? preset.costMultiplier,
    laborMultiplier: mult.laborMultiplier ?? preset.laborMultiplier,
  };
}

function renderPriceRuleSummary(rule, estimate) {
  const summary = $("price-rule-summary");
  if (!summary) return;
  if (!rule) {
    summary.textContent = "";
    return;
  }
  const lines = [`単価ルール：${rule.ruleName}`];
  if (rule.ruleName !== "手動調整") {
    lines.push(`材料：原価 × ${rule.costMultiplier}`);
    lines.push(`労務：原価 × ${rule.laborMultiplier}`);
  } else {
    lines.push("単価は手入力で調整します");
  }
  const discount = estimate?.shuseiDiscount ?? readShuseiDiscount();
  const memo = estimate?.shuseiDiscountMemo ?? $("shusei-discount-memo")?.value?.trim() ?? "";
  if (discount > 0) {
    lines.push(`出精値引き：-${discount.toLocaleString("ja-JP")}円`);
    if (memo) lines.push(`理由：${memo}`);
  }
  summary.textContent = lines.join("\n");
}

function renderShuseiPreview() {
  const el = $("shusei-discount-preview");
  if (!el) return;
  const discount = readShuseiDiscount();
  const memo = $("shusei-discount-memo")?.value?.trim() ?? "";
  if (discount <= 0) {
    el.textContent = "";
    return;
  }
  const lines = [`出精値引き：-${discount.toLocaleString("ja-JP")}円`];
  if (memo) lines.push(`理由：${memo}`);
  el.textContent = lines.join("\n");
}

function renderPriceRulePanel(p) {
  const panel = $("price-rule-panel");
  if (!panel) return;
  currentCustomerName = p.customerName || p.title || "";
  const customerEl = $("price-rule-customer");
  if (customerEl) customerEl.textContent = currentCustomerName ? `顧客：${currentCustomerName}` : "";
  currentPriceRule = p.priceRule || null;
  populatePriceRuleSelect(currentPriceRule);
  renderPriceRuleSummary(currentPriceRule, p.estimate);
  renderShuseiPreview();
}

async function loadPriceRulePresets() {
  try {
    const data = await api("/price-rules");
    priceRulePresets = data.presets || [];
  } catch (e) {
    console.warn("[estimate-v1] price-rules load failed", e);
    priceRulePresets = [];
  }
}

async function patchItems(body) {
  const res = await fetch(`${API}/projects/${currentProjectId}/items`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCustomerToken()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || data.message || `HTTP ${res.status}`);
    e.status = res.status;
    e.manualLineIndices = data.manualLineIndices;
    throw e;
  }
  return data;
}

async function recalcWithPriceRule(forceOverwrite = false) {
  if (!currentProjectId) return;
  recalcLocal();
  const priceRule = readSelectedPriceRule();
  if (priceRule?.ruleName === "手動調整") {
    toast("手動調整モードです。単価は自動では変わりません");
    return;
  }
  try {
    const result = await patchItems({
      items: currentLines,
      notes: $("estimate-notes").value.trim(),
      shuseiDiscount: readShuseiDiscount(),
      shuseiDiscountMemo: $("shusei-discount-memo")?.value.trim() ?? "",
      applyPriceRule: true,
      forceOverwriteManualLines: forceOverwrite,
      priceRule,
    });
    renderLines(result.estimate.items || []);
    updateTotalsFromEstimate(result.estimate);
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, result.estimate);
    hidePdfPreview();
    toast("倍率で再計算しました");
  } catch (e) {
    if (e.status === 409 && e.message === "manual_price_lines") {
      const ok = window.confirm("手入力の単価があります。上書きしますか？");
      if (ok) await recalcWithPriceRule(true);
      return;
    }
    toastError(e, e.status);
  }
}

function isLikelyImageFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "");
  if (type.startsWith("image/")) return true;
  if ((type === "" || type === "application/octet-stream") && IMAGE_EXT_RE.test(name)) return true;
  return false;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file) {
  return readFileAsDataUrl(file).then((dataUrl) => {
    const b64 = String(dataUrl).split(",")[1];
    if (!b64) throw new Error("base64 empty");
    return b64;
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image decode failed"));
    el.src = dataUrl;
  });
}

function isHeicLike(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type.includes("heic") || type.includes("heif") || /\.heic$|\.heif$/.test(name);
}

async function decodeImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() };
    } catch (err) {
      console.warn("[estimate-v1] createImageBitmap failed", err, file.name);
    }
  }
  const dataUrl = String(await readFileAsDataUrl(file));
  const img = await loadImageFromDataUrl(dataUrl);
  return { source: img, width: img.width, height: img.height, cleanup: () => {} };
}

function canvasToJpegBase64(canvas, quality = 0.82) {
  const out = canvas.toDataURL("image/jpeg", quality);
  const b64 = out.split(",")[1];
  if (!b64 || b64.length < 16) throw new Error("compression failed");
  return b64;
}

async function compressImage(file, maxWidth = 1600, quality = 0.82) {
  const decoded = await decodeImageSource(file);
  try {
    let width = decoded.width;
    let height = decoded.height;
    if (!width || !height) throw new Error("invalid image dimensions");
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(decoded.source, 0, 0, width, height);
    return canvasToJpegBase64(canvas, quality);
  } finally {
    decoded.cleanup();
  }
}

async function fileToUploadBase64(file) {
  try {
    return await compressImage(file);
  } catch (compressErr) {
    console.warn("[estimate-v1] compress failed", compressErr, file.name);
    if (isHeicLike(file)) throw Object.assign(new Error("heic decode failed"), { status: 400, heic: true });
    return readFileAsBase64(file);
  }
}

function revokeCompletionPendingPreviews() {
  completionPendingPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  completionPendingPreviewUrls = [];
}

function showCompletionTitleStatus(photoId, msg, isError = false) {
  const el = document.querySelector(`.completion-title-status[data-photo-id="${photoId}"]`);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b91c1c" : "#64748b";
}

function openCompletionLightbox(url) {
  const box = $("completion-photo-lightbox");
  const img = $("completion-lightbox-img");
  if (!box || !img || !url) return;
  img.src = url;
  box.classList.remove("hidden");
}

function closeCompletionLightbox() {
  const box = $("completion-photo-lightbox");
  const img = $("completion-lightbox-img");
  if (!box || !img) return;
  box.classList.add("hidden");
  img.src = "";
}

function renderCompletionPhotos(pendingFiles = []) {
  const el = $("completion-photo-list");
  if (!el) return;
  const pendingHtml = pendingFiles
    .map((file) => {
      const url = URL.createObjectURL(file);
      completionPendingPreviewUrls.push(url);
      return `<div class="completion-photo-card photo-pending"><button type="button" class="completion-photo-preview-btn" tabindex="-1"><img src="${url}" alt="" /></button><p class="survey-photo-hint" style="margin:0.35rem 0 0;">送信中…</p></div>`;
    })
    .join("");
  if (!completionPhotos.length && !pendingHtml) {
    el.innerHTML = '<p class="survey-photo-hint">まだ写真がありません</p>';
    return;
  }
  el.innerHTML =
    pendingHtml +
    completionPhotos
    .map((ph, idx) => {
      const canUp = idx > 0;
      const canDown = idx < completionPhotos.length - 1;
      return `
    <div class="completion-photo-card" data-photo-id="${ph.id}">
      <button type="button" class="completion-photo-preview-btn" data-photo-url="${escapeHtml(ph.url)}" aria-label="写真を拡大表示">
        <img src="${escapeHtml(ph.url)}" alt="" loading="lazy" decoding="async" />
      </button>
      <label class="friendly-label" style="margin:0.35rem 0 0;">タイトル
        <input type="text" class="completion-title-input" data-photo-id="${ph.id}" value="${escapeHtml(ph.title || "")}" maxlength="120" inputmode="text" enterkeyhint="done" autocomplete="off" />
        <span class="completion-title-status" data-photo-id="${ph.id}" aria-live="polite"></span>
      </label>
      <div class="completion-photo-actions">
        <button type="button" class="btn-sub btn-small completion-reorder-btn" data-photo-id="${ph.id}" data-direction="up" ${canUp ? "" : "disabled"}>↑ 上へ</button>
        <button type="button" class="btn-sub btn-small completion-reorder-btn" data-photo-id="${ph.id}" data-direction="down" ${canDown ? "" : "disabled"}>↓ 下へ</button>
        <button type="button" class="btn-sub btn-small btn-del-completion-photo" data-photo-id="${ph.id}">削除</button>
      </div>
    </div>`;
    })
    .join("");
  el.querySelectorAll(".completion-photo-preview-btn[data-photo-url]").forEach((btn) => {
    btn.addEventListener("click", () => openCompletionLightbox(btn.dataset.photoUrl));
  });
  el.querySelectorAll(".completion-title-input").forEach((inp) => {
    const photoId = inp.dataset.photoId;
    const persistTitle = async () => {
      const title = inp.value;
      if (completionTitleLastSaved.get(photoId) === title) return;
      try {
        await api(`/projects/${currentProjectId}/completion-photos/${photoId}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        });
        completionTitleLastSaved.set(photoId, title);
        const ph = completionPhotos.find((p) => p.id === photoId);
        if (ph) ph.title = title;
        showCompletionTitleStatus(photoId, COMPLETION_TITLE_SAVE_OK);
      } catch (e) {
        showCompletionTitleStatus(photoId, "保存に失敗しました", true);
        toastError(e, e.status);
      }
    };
    inp.addEventListener("input", () => {
      showCompletionTitleStatus(photoId, "");
      if (completionTitleTimers.has(photoId)) clearTimeout(completionTitleTimers.get(photoId));
      completionTitleTimers.set(
        photoId,
        setTimeout(async () => {
          completionTitleTimers.delete(photoId);
          await persistTitle();
        }, 600)
      );
    });
    inp.addEventListener("blur", async () => {
      if (completionTitleTimers.has(photoId)) {
        clearTimeout(completionTitleTimers.get(photoId));
        completionTitleTimers.delete(photoId);
      }
      await persistTitle();
    });
  });
  el.querySelectorAll(".completion-reorder-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      await moveCompletionPhoto(btn.dataset.photoId, btn.dataset.direction);
    });
  });
  el.querySelectorAll(".btn-del-completion-photo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const photoId = btn.dataset.photoId;
      if (!confirm("この写真を削除しますか？")) return;
      try {
        await api(`/projects/${currentProjectId}/completion-photos/${photoId}`, { method: "DELETE" });
        completionPhotos = completionPhotos.filter((p) => p.id !== photoId);
        completionTitleLastSaved.delete(photoId);
        renderCompletionPhotos();
        hidePdfPreview();
        toast("写真を削除しました");
      } catch (e) {
        toastError(e, e.status);
      }
    });
  });
}

async function moveCompletionPhoto(photoId, direction) {
  if (!currentProjectId || !photoId) return;
  const idx = completionPhotos.findIndex((p) => p.id === photoId);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= completionPhotos.length) return;

  const next = completionPhotos.slice();
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  completionPhotos = next;
  renderCompletionPhotos();

  try {
    const result = await api(`/projects/${currentProjectId}/completion-photos/${photoId}/move`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    });
    if (Array.isArray(result.photos)) {
      completionPhotos = result.photos;
      for (const ph of completionPhotos) {
        completionTitleLastSaved.set(ph.id, ph.title || "");
      }
      renderCompletionPhotos();
      hidePdfPreview();
    }
  } catch (e) {
    await loadCompletionPhotos();
    toastError(e, e.status);
  }
}

async function loadCompletionPhotos() {
  if (!currentProjectId) return;
  const data = await api(`/projects/${currentProjectId}/completion-photos`);
  completionPhotos = data.photos || [];
  for (const ph of completionPhotos) {
    completionTitleLastSaved.set(ph.id, ph.title || "");
  }
  renderCompletionPhotos();
}

async function uploadCompletionPhotos(files) {
  if (!currentProjectId || !files?.length) return;
  const imageFiles = [...files].filter(isLikelyImageFile);
  if (!imageFiles.length) {
    toast(COMPLETION_PHOTO_FAIL_MSG);
    return;
  }
  const room = MAX_COMPLETION_PHOTOS - completionPhotos.length;
  if (room <= 0) {
    toast(`写真は最大${MAX_COMPLETION_PHOTOS}枚までです`);
    return;
  }
  const batch = imageFiles.slice(0, room);
  if (batch.length < imageFiles.length) {
    toast(`残り${room}枚分だけ追加します（上限${MAX_COMPLETION_PHOTOS}枚）`);
  }
  revokeCompletionPendingPreviews();
  renderCompletionPhotos(batch);
  toast("写真をアップロード中…");
  let done = 0;
  let failed = false;
  for (const file of batch) {
    try {
      const imageBase64 = await fileToUploadBase64(file);
      const photo = await api(`/projects/${currentProjectId}/completion-photos`, {
        method: "POST",
        body: JSON.stringify({
          imageBase64,
          fileName: (file.name || "photo").replace(/\.[^.]+$/, ".jpg"),
          title: "",
        }),
      });
      completionPhotos.push(photo);
      completionTitleLastSaved.set(photo.id, photo.title || "");
      done += 1;
      revokeCompletionPendingPreviews();
      renderCompletionPhotos(batch.slice(done));
    } catch (e) {
      failed = true;
      console.error("[estimate-v1] completion photo upload failed", e, file.name);
    }
  }
  revokeCompletionPendingPreviews();
  renderCompletionPhotos();
  hidePdfPreview();
  if (done > 0) toast(failed ? `${done}枚追加（一部失敗）` : "写真を追加しました");
  else toast(COMPLETION_PHOTO_FAIL_MSG);
}

function renderStandalonePreview() {
  /* removed — standalone creates header-only docs */
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function renderCustomerSuggestList(el, suggestions, onPick) {
  if (!el) return;
  if (!suggestions?.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = suggestions
    .map(
      (s, i) =>
        `<li data-suggest-idx="${i}"><strong>${escapeHtml(s.name)}</strong>${s.contactName ? ` · ${escapeHtml(s.contactName)}` : ""}${s.address ? `<br><span style="color:#64748b;font-size:0.8rem;">${escapeHtml(s.address)}</span>` : ""}</li>`
    )
    .join("");
  el.querySelectorAll("li").forEach((node) => {
    node.addEventListener("click", () => {
      const s = suggestions[Number(node.dataset.suggestIdx)];
      if (s) onPick(s);
      el.classList.add("hidden");
    });
  });
}

async function fetchCustomerSuggestions(query) {
  if (!query || query.trim().length < 1) return [];
  const data = await api(`/customers/suggest?q=${encodeURIComponent(query.trim())}`);
  return data.suggestions || [];
}

function bindCustomerSuggest(inputEl, listEl, onPick) {
  if (!inputEl || !listEl) return;
  inputEl.addEventListener("input", () => {
    clearTimeout(customerSuggestTimer);
    const q = inputEl.value.trim();
    if (q.length < 1) {
      listEl.classList.add("hidden");
      return;
    }
    customerSuggestTimer = setTimeout(async () => {
      try {
        const suggestions = await fetchCustomerSuggestions(q);
        renderCustomerSuggestList(listEl, suggestions, onPick);
      } catch {
        listEl.classList.add("hidden");
      }
    }, 220);
  });
  inputEl.addEventListener("blur", () => {
    setTimeout(() => listEl.classList.add("hidden"), 180);
  });
}

async function loadLineTemplates() {
  try {
    const data = await api("/line-templates");
    lineTemplates = data.templates || [];
    const sel = $("line-template-select");
    if (!sel) return;
    sel.innerHTML =
      `<option value="">よく使うテンプレート…</option>` +
      lineTemplates.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
  } catch {
    /* optional */
  }
}

function resetStandaloneForm(mode) {
  standaloneMode = mode;
  const isInvoice = mode === "invoice";
  $("standalone-form-title").textContent = isInvoice ? "新規請求書" : "新規見積";
  $("standalone-addressee").value = "";
  $("standalone-staff").value = "";
  $("standalone-subject").value = "";
  $("standalone-work-location").value = "";
  $("standalone-notes").value = "";
  $("standalone-invoice-date").value = todayIsoDate();
  $("standalone-payment-due").value = "";
  $("standalone-invoice-fields")?.classList.toggle("hidden", !isInvoice);
  $("standalone-work-location-wrap")?.classList.toggle("hidden", isInvoice);
  $("standalone-customer-suggest")?.classList.add("hidden");
  $("standalone-form-panel")?.classList.remove("hidden");
  $("pending-list")?.classList.add("hidden");
  $("project-list")?.classList.add("hidden");
  $("invoice-list")?.classList.add("hidden");
  document.querySelector(".tab-row")?.classList.add("hidden");
}

function hideStandaloneForm() {
  $("standalone-form-panel")?.classList.add("hidden");
  document.querySelector(".tab-row")?.classList.remove("hidden");
  refreshListTabVisibility();
}

function addStandaloneDraftLine() {
  /* removed */
}

async function submitStandaloneForm() {
  const addressee = $("standalone-addressee")?.value?.trim();
  const subject = $("standalone-subject")?.value?.trim();
  const staffName = $("standalone-staff")?.value?.trim() ?? "";
  const workLocation = $("standalone-work-location")?.value?.trim() ?? "";
  const notes = $("standalone-notes")?.value?.trim() ?? "";
  if (!addressee || !subject) {
    toast("宛名と件名を入力してください");
    return;
  }
  const path =
    standaloneMode === "invoice" ? "/standalone-invoice" : "/standalone-estimate";
  const body =
    standaloneMode === "invoice"
      ? {
          addressee,
          subject,
          staffName,
          notes,
          invoiceDate: $("standalone-invoice-date")?.value || todayIsoDate(),
          paymentDueDate: $("standalone-payment-due")?.value || "",
          items: [],
        }
      : {
          addressee,
          subject,
          staffName,
          workLocation,
          notes,
          items: [],
        };
  try {
    toast("作成中…");
    const detail = await api(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    hideStandaloneForm();
    toast(standaloneMode === "invoice" ? "請求書を作成しました" : "見積を作成しました");
    await loadProjects();
    await loadInvoices();
    await openDetail(detail.businessProjectId);
  } catch (e) {
    toastError(e, e.status);
  }
}

async function openDetail(projectId) {
  currentProjectId = projectId;
  showView("detail");
  $("toms-section").classList.add("hidden");
  lastTomsData = null;
  hidePdfPreview();
  completionPhotos = [];
  try {
    const p = await api(`/projects/${projectId}`);
    $("detail-name").textContent = p.customerName || p.title;
    renderCustomerInfo(p);
    renderPriceRulePanel(p);
    const statusEl = $("detail-status");
    if (p.pdfPath) {
      statusEl.textContent = "見積書の準備ができました";
      statusEl.className = "status-badge done";
    } else {
      statusEl.textContent = p.estimate ? "下書き" : "未作成";
      statusEl.className = "status-badge orange";
    }
    hasInvoice = Boolean(p.invoice);
    currentSurveyProjectId = p.surveyProjectId || null;
    const metaParts = [p.projectNo, p.estimate?.estimateNo].filter(Boolean);
    $("detail-meta").textContent = metaParts.join(" · ");
    $("estimate-notes").value = p.estimateNotes || "";
    if ($("hdr-notes") && p.estimateNotes) $("hdr-notes").value = p.estimateNotes;
    fillHeaderForm(p.header);
    fillInvoiceHeaderForm(p, p.invoice);
    $("btn-invoice")?.classList.toggle("hidden", hasInvoice);
    renderLines(p.estimate?.items || []);
    if ($("shusei-discount")) $("shusei-discount").value = String(p.estimate?.shuseiDiscount ?? 0);
    if ($("shusei-discount-memo")) $("shusei-discount-memo").value = p.estimate?.shuseiDiscountMemo ?? "";
    updateTotalsFromEstimate(p.estimate);
    const surveyLink = $("link-survey-photos");
    if (surveyLink) {
      surveyLink.href = p.surveyProjectId
        ? `/survey-v1?project=${encodeURIComponent(p.surveyProjectId)}`
        : "/survey-v1";
    }
    await loadCompletionPhotos();
  } catch (e) {
    toastError(e, e.status);
    showView("list");
  }
}

async function saveItems() {
  recalcLocal();
  return patchItems({
    items: currentLines,
    notes: $("estimate-notes").value.trim(),
    shuseiDiscount: readShuseiDiscount(),
    shuseiDiscountMemo: $("shusei-discount-memo")?.value.trim() ?? "",
    priceRule: readSelectedPriceRule(),
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
  const invoices = tab === "invoices";
  $("tab-pending").classList.toggle("active", pending);
  $("tab-projects").classList.toggle("active", tab === "projects");
  $("tab-invoices")?.classList.toggle("active", invoices);
  refreshListTabVisibility();
  if (invoices) loadInvoices();
}

async function regenerateProjectPdf(kind) {
  if (!currentProjectId) return;
  const label = kind === "invoice" ? "請求書" : "見積書";
  if (!confirm(`${label}PDFを再作成しますか？\n保存済みPDFが上書きされます。`)) return;
  try {
    if (kind === "estimate" || kind === "invoice") {
      await saveHeader().catch(() => ({}));
      await saveItems().catch(() => ({}));
    }
    const path =
      kind === "invoice"
        ? `/projects/${currentProjectId}/invoice/pdf/regenerate`
        : `/projects/${currentProjectId}/pdf/regenerate`;
    const result = await api(path, { method: "POST", body: "{}" });
    toast(`${label}PDFを再作成しました`);
    if (kind === "estimate") {
      $("detail-status").textContent = "見積書の準備ができました";
      $("detail-status").className = "status-badge done";
    }
    return result.pdfPath;
  } catch (e) {
    toastError(e, e.status);
    return null;
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  await loadPriceRulePresets();
  practicalNav = initPracticalNav({
    appId: "estimate_v1",
    appName: "見積",
    theme: "blue",
    onBack: () => {
      showView("list");
      loadPending();
      loadProjects();
      loadInvoices();
    },
  });
  practicalNav.setToast(toast);
  showView("list");
  await loadPending();
  await loadProjects();
  await loadInvoices();
  await loadLineTemplates();

  bindCustomerSuggest($("standalone-addressee"), $("standalone-customer-suggest"), (s) => {
    $("standalone-addressee").value = s.name;
    if ($("standalone-staff") && s.contactName) $("standalone-staff").value = s.contactName;
    if ($("standalone-work-location") && s.address) $("standalone-work-location").value = s.address;
  });
  bindCustomerSuggest($("hdr-addressee"), $("hdr-customer-suggest"), (s) => {
    $("hdr-addressee").value = s.name;
    if ($("hdr-staff") && s.contactName) $("hdr-staff").value = s.contactName;
    if ($("hdr-address") && s.address) $("hdr-address").value = s.address;
    if ($("hdr-phone") && s.phone) $("hdr-phone").value = s.phone;
  });

  $("tab-pending").addEventListener("click", () => setListTab("pending"));
  $("tab-projects").addEventListener("click", () => setListTab("projects"));
  $("tab-invoices")?.addEventListener("click", () => setListTab("invoices"));

  $("btn-new-standalone-estimate")?.addEventListener("click", () => resetStandaloneForm("estimate"));
  $("btn-new-standalone-invoice")?.addEventListener("click", () => resetStandaloneForm("invoice"));
  $("btn-standalone-submit")?.addEventListener("click", submitStandaloneForm);
  $("btn-standalone-cancel")?.addEventListener("click", hideStandaloneForm);

  $("btn-apply-line-template")?.addEventListener("click", async () => {
    const templateId = $("line-template-select")?.value;
    if (!templateId) {
      toast("テンプレートを選んでください");
      return;
    }
    try {
      const data = await api(`/line-templates/${encodeURIComponent(templateId)}/items`);
      const items = (data.items || []).map((it) => ({ ...it, id: undefined }));
      if (!items.length) {
        toast("テンプレートに明細がありません");
        return;
      }
      currentLines = items.map((it) => ({ ...newEmptyLine(), ...it }));
      renderLines(currentLines);
      toast("テンプレートを反映しました");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-confirm-estimate")?.addEventListener("click", async () => {
    if (!pendingSurveyForEstimate) return;
    try {
      await createEstimateFromSurvey(pendingSurveyForEstimate);
    } catch (e) {
      toastError(e, e.status);
    }
  });
  $("btn-cancel-candidates")?.addEventListener("click", () => {
    pendingSurveyForEstimate = null;
    $("material-candidates-panel")?.classList.add("hidden");
    $("pending-list")?.classList.remove("hidden");
  });

  $("btn-save-header").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await saveHeader();
      toast("ヘッダーを保存しました");
      hidePdfPreview();
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-add-line").addEventListener("click", () => {
    currentLines.push(newEmptyLine());
    renderLines(currentLines);
  });

  $("shusei-discount")?.addEventListener("input", () => recalcLocal());
  $("shusei-discount")?.addEventListener("change", () => recalcLocal());
  $("shusei-discount-memo")?.addEventListener("input", () => recalcLocal());

  $("price-rule-select")?.addEventListener("change", () => {
    const preset = priceRulePresets.find((p) => p.id === $("price-rule-select")?.value);
    syncMultiplierInputsFromRule(currentPriceRule, preset);
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, { shuseiDiscount: readShuseiDiscount() });
  });

  $("cost-multiplier")?.addEventListener("input", () => {
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, { shuseiDiscount: readShuseiDiscount() });
  });
  $("labor-multiplier")?.addEventListener("input", () => {
    currentPriceRule = readSelectedPriceRule();
    renderPriceRuleSummary(currentPriceRule, { shuseiDiscount: readShuseiDiscount() });
  });

  $("btn-recalc-price-rule")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await recalcWithPriceRule(false);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-save-items").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const result = await saveItems();
      toast("内訳を保存しました");
      updateTotalsFromEstimate(result.estimate);
      const refreshed = await api(`/projects/${currentProjectId}`);
      renderPriceRulePanel({
        customerName: refreshed.customerName,
        priceRule: refreshed.priceRule,
        estimate: result.estimate,
      });
      hidePdfPreview();
      $("detail-status").textContent = "下書き";
      $("detail-status").className = "status-badge orange";
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-completion-camera")?.addEventListener("click", () => $("completion-photo-input-camera")?.click());
  $("btn-completion-library")?.addEventListener("click", () => $("completion-photo-input-library")?.click());

  $("completion-photo-input-camera")?.addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = "";
    if (!files.length) return;
    try {
      await uploadCompletionPhotos(files);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("completion-photo-input-library")?.addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = "";
    if (!files.length) return;
    try {
      await uploadCompletionPhotos(files);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("completion-lightbox-close")?.addEventListener("click", closeCompletionLightbox);
  $("completion-photo-lightbox")?.addEventListener("click", (ev) => {
    if (ev.target === $("completion-photo-lightbox")) closeCompletionLightbox();
  });

  $("btn-pdf-estimate").addEventListener("click", () => openDocumentViewer("estimate"));
  $("btn-regenerate-estimate")?.addEventListener("click", () => regenerateProjectPdf("estimate"));
  $("btn-pdf-invoice").addEventListener("click", () => openDocumentViewer("invoice"));
  $("btn-regenerate-invoice")?.addEventListener("click", () => regenerateProjectPdf("invoice"));
  $("btn-pdf-specification").addEventListener("click", () => openDocumentViewer("specification"));
  $("btn-pdf-completion").addEventListener("click", () => openDocumentViewer("completion"));

  $("btn-create-completion-report")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const ok = await confirmChecklistBeforeReport(
        async (path, opts = {}) => {
          const token = getCustomerToken();
          const res = await fetch(path.startsWith("/") ? path : `${WORK_API}${path}`, {
            ...opts,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...(opts.headers || {}),
            },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          return data;
        },
        { projectSource: "business", projectId: currentProjectId }
      );
      if (!ok) return;
      await api(`/projects/${currentProjectId}/completion-report/create`, { method: "POST", body: "{}" });
      openDocumentViewer("completion");
      toast("完了報告書を作成しました");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-duplicate-estimate").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積を複製しますか？\n内容はそのまま、見積番号だけ新しく発番します。")) return;
    try {
      const detail = await api(`/projects/${currentProjectId}/duplicate`, {
        method: "POST",
        body: "{}",
      });
      toast(`複製しました（${detail.estimate?.estimateNo || "新規"}）`);
      hidePdfPreview();
      $("hdr-estimate-no").value = detail.header?.estimateNo || detail.estimate?.estimateNo || "";
      $("detail-status").textContent = "下書き";
      $("detail-status").className = "status-badge orange";
      hasInvoice = false;
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-finalize").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積を確定しますか？\n印刷・提出用の見積書が作れます。")) return;
    try {
      await saveHeader().catch(() => ({}));
      await saveItems();
      const result = await api(`/projects/${currentProjectId}/finalize`, {
        method: "POST",
        body: JSON.stringify({ includePhotos: false }),
      });
      toast("見積を確定しました");
      openDocumentViewer("estimate");
      $("detail-status").textContent = "見積書の準備ができました";
      $("detail-status").className = "status-badge done";
      updateTotalsFromEstimate(result.estimate);
      await loadProjects();
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-invoice").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積をもとに請求書を作成しますか？")) return;
    try {
      await saveHeader().catch(() => ({}));
      await saveItems();
      await api(`/projects/${currentProjectId}/invoice`, { method: "POST", body: "{}" });
      hasInvoice = true;
      $("btn-invoice")?.classList.add("hidden");
      const refreshed = await api(`/projects/${currentProjectId}`);
      fillInvoiceHeaderForm(refreshed, refreshed.invoice);
      toast("請求書を作成しました（明細をコピーしました）");
      openDocumentViewer("invoice");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-toms").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const data = await api(`/projects/${currentProjectId}/toms-format`);
      lastTomsData = data;
      const preview = {
        header: data.header,
        total: data.total,
        subtotal: data.subtotal,
        tax: data.tax,
        lines: data.lines,
        notes: data.notes,
        company: data.company,
      };
      $("toms-preview").textContent = JSON.stringify(preview, null, 2);
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

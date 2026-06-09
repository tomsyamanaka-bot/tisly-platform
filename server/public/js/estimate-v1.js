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
let hasInvoice = false;
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
  };
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
  $("line-list").querySelectorAll(".qty-input, .price-input, .desc-input").forEach((inp) => {
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
      <label class="friendly-label" style="margin:0 0 0.35rem;">適用（複数行可）</label>
      <textarea class="desc-input line-desc-input" data-idx="${i}" rows="3" placeholder="小上がり既存換気扇3台設置&#10;清掃・修理配線">${escapeHtml(splitDescription(it.name, it.memo))}</textarea>
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

function readShuseiDiscount() {
  return Math.max(0, Math.round(Number($("shusei-discount")?.value || 0)));
}

function recalcLocal() {
  $("line-list").querySelectorAll(".line-card").forEach((row) => {
    const i = Number(row.dataset.idx);
    const qty = Number(row.querySelector(".qty-input")?.value || 1);
    const price = Number(row.querySelector(".price-input")?.value || 0);
    const desc = row.querySelector(".desc-input")?.value || "";
    const parsed = parseDescription(desc);
    if (currentLines[i]) {
      currentLines[i].quantity = qty;
      currentLines[i].unitPrice = price;
      currentLines[i].name = parsed.name;
      currentLines[i].memo = parsed.memo;
      currentLines[i].amount = Math.round(qty * price);
      const amtEl = row.querySelector(".line-amount");
      if (amtEl) amtEl.textContent = `金額 ${yen(currentLines[i].amount)}`;
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

async function showDocumentPreview(kind) {
  if (!currentProjectId) return;
  if (kind === "invoice" && !hasInvoice) {
    toast("先に請求書を作成してください");
    return;
  }
  const token = getCustomerToken();
  const url = buildPdfUrl(kind);
  const errEl = $("pdf-error");
  errEl.classList.remove("visible");
  errEl.innerHTML = "";
  try {
    toast("書類を読み込み中…");
    if (kind === "estimate" || kind === "invoice") {
      await saveHeader().catch(() => ({}));
      await saveItems().catch(() => ({}));
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const status = res.status;
      if (status === 401) {
        errEl.innerHTML = "<strong>ログインが切れました。もう一度ログインしてください</strong>";
        errEl.classList.add("visible");
        $("pdf-section").classList.remove("hidden");
        toast("ログインが切れました。もう一度ログインしてください");
        return;
      }
      throw Object.assign(new Error(data.error || `HTTP ${status}`), { status });
    }
    const blob = await res.blob();
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = URL.createObjectURL(blob);
    $("pdf-preview").src = pdfBlobUrl;
    $("link-pdf").href = buildPdfTabUrl(kind, token);
    $("pdf-section").classList.remove("hidden");
    toast(`${PDF_LABELS[kind] || "書類"}を表示しました`);
  } catch (e) {
    if (e.status === 401) {
      errEl.innerHTML = "<strong>ログインが切れました。もう一度ログインしてください</strong>";
      errEl.classList.add("visible");
      $("pdf-section").classList.remove("hidden");
      toast("ログインが切れました。もう一度ログインしてください");
      return;
    }
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

function renderPriceRulePanel(p) {
  const panel = $("price-rule-panel");
  const summary = $("price-rule-summary");
  if (!panel || !summary) return;
  const rule = p.priceRule;
  if (!rule) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const discount = p.estimate?.shuseiDiscount ?? 0;
  const lines = [
    `単価ルール：${rule.ruleName}`,
    `材料：原価 × ${rule.costMultiplier}`,
    `労務：原価 × ${rule.laborMultiplier}`,
  ];
  if (discount > 0) lines.push(`出精値引き：-${discount.toLocaleString("ja-JP")}円`);
  summary.textContent = lines.join("\n");
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
    if (p.surveyProjectId) {
      metaParts.push(
        `<a href="/survey-v1?project=${encodeURIComponent(p.surveyProjectId)}" style="color:var(--tisly-blue)">← 現調の内容を見る</a>`
      );
    }
    $("detail-meta").innerHTML = metaParts.join(" · ");
    $("estimate-notes").value = p.estimateNotes || "";
    fillHeaderForm(p.header);
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
  return api(`/projects/${currentProjectId}/items`, {
    method: "PATCH",
    body: JSON.stringify({
      items: currentLines,
      notes: $("estimate-notes").value.trim(),
      shuseiDiscount: readShuseiDiscount(),
      shuseiDiscountMemo: $("shusei-discount-memo")?.value.trim() ?? "",
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

  $("btn-save-items").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const result = await saveItems();
      toast("内訳を保存しました");
      updateTotalsFromEstimate(result.estimate);
      renderPriceRulePanel({
        priceRule: (await api(`/projects/${currentProjectId}`)).priceRule,
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

  $("btn-pdf-estimate").addEventListener("click", () => showDocumentPreview("estimate"));
  $("btn-pdf-invoice").addEventListener("click", () => showDocumentPreview("invoice"));
  $("btn-pdf-specification").addEventListener("click", () => showDocumentPreview("specification"));
  $("btn-pdf-completion").addEventListener("click", () => showDocumentPreview("completion"));

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
      await showDocumentPreview("estimate");
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
      toast("請求書を作成しました");
      await showDocumentPreview("invoice");
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

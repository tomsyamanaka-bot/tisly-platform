import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { friendlyHttpError, renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

let practicalNav = null;

const WORKFLOW_LABELS = {
  surveying: "現場調査中",
  estimate_pending: "見積もり作成待ち",
  estimate_done: "見積もり済み",
  ordered: "受注済み",
  completed: "完了",
};

const WORK_TYPES = [
  { key: "camera", label: "防犯カメラ" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "lan", label: "LAN" },
  { key: "intercom", label: "インターホン" },
  { key: "tv", label: "TV" },
  { key: "electrical", label: "電気工事" },
  { key: "aircon", label: "エアコン" },
  { key: "ev", label: "EV" },
  { key: "other", label: "その他" },
];

let cachedWorkTemplates = [];
let selectedTemplateIds = new Set();
let selectedWorkTypes = new Set();

const MATERIAL_PICKER = [
  { key: "camera", icon: "📷", label: "防犯カメラ" },
  { key: "wifi", icon: "📶", label: "Wi-Fi" },
  { key: "intercom", icon: "🔔", label: "インターホン" },
  { key: "electrical", icon: "🔌", label: "コンセント" },
  { key: "lighting", icon: "💡", label: "照明" },
  { key: "lan", icon: "🌐", label: "LAN配線" },
  { key: "antenna", icon: "📡", label: "アンテナ" },
  { key: "other", icon: "📦", label: "その他" },
];

const MATERIAL_ICONS = Object.fromEntries(MATERIAL_PICKER.map((m) => [m.key, m.icon]));
const MATERIAL_LABELS = Object.fromEntries(MATERIAL_PICKER.map((m) => [m.key, m.label]));

let selectedMaterialCategory = "camera";

const API = "/api/survey/v1";
let currentProjectId = null;
let currentSiteId = null;
let currentCustomerId = null;
let cachedPhotos = [];
let pendingPreviewUrls = [];
let photoDisplayLimit = 12;
const PHOTO_BATCH = 12;
const MAX_PHOTOS = 30;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const PHOTO_FAIL_MSG = "写真の形式か容量で失敗しました。別の写真で試してください";
const PHOTO_TITLE_PLACEHOLDERS = [
  "例：厨房コンセント",
  "例：小上がり照明",
  "例：玄関インターホン",
  "例：分電盤全景",
];
const PHOTO_TITLE_SAVE_OK = "保存しました";
const PHOTO_TITLE_SAVE_FAIL = "写真メモを保存できませんでした";
const PROJECT_MEMO_SAVE_OK = "メモを保存しました";
const PROJECT_MEMO_SAVE_FAIL = "メモを保存できませんでした";

let projectNotesLastSaved = "";
let detailMemoSaveTimer = null;
let detailMemoBound = false;
let surveyIsStorageAdmin = false;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function showFriendlyError(elId, err, status) {
  const el = $(elId);
  el.innerHTML = renderFriendlyErrorHtml(err, status);
  el.classList.remove("hidden");
}

function toastError(err, status) {
  const f = friendlyHttpError(err?.message || err, status);
  toast(`${f.title} — ${f.action}`);
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
    let msg = data.error;
    if (!msg && res.status === 413) msg = "payload too large";
    const e = new Error(msg || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function showView(name) {
  $("view-list").classList.toggle("hidden", name !== "list");
  $("view-form").classList.toggle("hidden", name !== "form");
  $("view-detail").classList.toggle("hidden", name !== "detail");
  $("view-edit").classList.toggle("hidden", name !== "edit");
  const titles = {
    list: "現調",
    form: "新しい現調",
    detail: "現調の内容",
    edit: "お客様・現場情報",
  };
  practicalNav?.setTitle(titles[name] || "現調");
  practicalNav?.setBackVisible(name !== "list");
  const hints = {
    list: "お客様の現場を見に行く記録を残します",
    form: "依頼主と現場を分けて入力できます",
    detail: "写真・部材・メモを確認して、見積へ送れます",
    edit: "依頼主と現場の情報を直せます",
  };
  $("page-hint").textContent = hints[name] || "";
}

function statusBadgeClass(status) {
  if (status === "estimate_pending") return "status-badge orange";
  if (status === "estimate_done" || status === "ordered" || status === "completed")
    return "status-badge done";
  return "status-badge green";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProjectList(projects) {
  const el = $("project-list");
  if (!projects.length) {
    el.className = "empty-state";
    el.innerHTML =
      '<div class="empty-icon">📋</div><p>まだ現調がありません</p><p>上の「＋ 新しい現調を作る」から始められます</p>';
    return;
  }
  el.className = "";
  el.innerHTML = projects
    .map(
      (p) => `
    <div class="friendly-card list-card" data-id="${p.projectId}">
      <div class="list-card-actions">
        <button type="button" class="list-card-action" data-action="copy" title="案件をコピー">📄</button>
        <button type="button" class="list-card-action" data-action="delete" title="案件を削除">🗑</button>
      </div>
      <span class="${statusBadgeClass(p.workflowStatus)}">${WORKFLOW_LABELS[p.workflowStatus] || p.workflowStatus}</span>
      <h2>${escapeHtml(p.siteName || p.customerName)}</h2>
      <p>${escapeHtml(p.customerName)} · ${escapeHtml(p.projectNo || p.projectId)}</p>
      <p>${escapeHtml(p.address || "")}</p>
    </div>`
    )
    .join("");
  el.querySelectorAll(".list-card").forEach((node) => {
    node.addEventListener("click", (ev) => {
      if (ev.target.closest(".list-card-action")) return;
      openDetail(node.dataset.id);
    });
    node.querySelector('[data-action="copy"]')?.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await copyProject(node.dataset.id);
    });
    node.querySelector('[data-action="delete"]')?.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await deleteProject(node.dataset.id);
    });
  });
}

async function copyProject(projectId) {
  try {
    toast("案件をコピーしています…");
    const copied = await api(`/projects/${projectId}/copy`, { method: "POST", body: "{}" });
    toast(`コピーしました（${copied.projectNo || copied.projectId}）`);
    await loadList();
  } catch (e) {
    toastError(e, e.status);
  }
}

async function deleteProject(projectId) {
  let preview = null;
  try {
    preview = await api(`/projects/${projectId}/delete-preview`);
  } catch {
    /* ignore */
  }
  let msg =
    "この現調データを削除しますか？写真・見積・報告書に使っている場合は注意してください。";
  if (preview?.warning) {
    msg += `\n\n⚠ ${preview.warning}`;
  }
  if (!confirm(msg)) return;
  try {
    await api(`/projects/${projectId}`, { method: "DELETE" });
    toast("削除しました");
    await loadList();
  } catch (e) {
    toastError(e, e.status);
  }
}

async function loadList() {
  const code = customerCodeFromPath();
  try {
    const data = await api(`/projects?customerCode=${encodeURIComponent(code)}`);
    renderProjectList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

function getSelectedWorkTypesFromDom(containerId) {
  const el = $(containerId);
  if (!el) return [];
  return [...el.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
}

function renderWorkTypeGrid(containerId, selected = [], { namePrefix = "workType" } = {}) {
  const el = $(containerId);
  if (!el) return;
  const set = new Set(selected);
  el.innerHTML = WORK_TYPES.map(
    (wt) => `<label class="work-type-chip${set.has(wt.key) ? " selected" : ""}">
      <input type="checkbox" name="${namePrefix}" value="${wt.key}" ${set.has(wt.key) ? "checked" : ""} />
      <span>${escapeHtml(wt.label)}</span>
    </label>`
  ).join("");
  el.querySelectorAll(".work-type-chip").forEach((chip) => {
    const cb = chip.querySelector("input");
    cb?.addEventListener("change", () => {
      chip.classList.toggle("selected", cb.checked);
    });
  });
}

function renderTemplateList(containerId, templates, selectedIds = []) {
  const el = $(containerId);
  if (!el) return;
  if (!templates.length) {
    el.innerHTML = "<p class='section-hint'>テンプレートがありません</p>";
    return;
  }
  const set = new Set(selectedIds);
  el.innerHTML = templates
    .map(
      (t) => `<label class="template-card${set.has(t.id) ? " selected" : ""}" data-id="${escapeHtml(t.id)}">
        <input type="checkbox" value="${escapeHtml(t.id)}" ${set.has(t.id) ? "checked" : ""} />
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          ${t.description ? `<p class="section-hint">${escapeHtml(t.description)}</p>` : ""}
          <p class="section-hint">${t.items?.length ?? 0} 項目</p>
        </div>
      </label>`
    )
    .join("");
  el.querySelectorAll(".template-card").forEach((card) => {
    const cb = card.querySelector("input");
    cb?.addEventListener("change", () => {
      card.classList.toggle("selected", cb.checked);
    });
  });
}

async function loadWorkTemplates() {
  if (cachedWorkTemplates.length) return cachedWorkTemplates;
  const data = await api("/work-templates");
  cachedWorkTemplates = data.templates || [];
  return cachedWorkTemplates;
}

function renderMaterialPicker() {
  const grid = $("material-picker");
  if (!grid) return;
  grid.innerHTML = MATERIAL_PICKER.map(
    (m) =>
      `<button type="button" class="material-pick-card${m.key === selectedMaterialCategory ? " selected" : ""}" data-cat="${m.key}" aria-pressed="${m.key === selectedMaterialCategory}">
        <span class="material-pick-icon">${m.icon}</span>
        <span class="material-pick-label">${m.label}</span>
      </button>`
  ).join("");
  grid.querySelectorAll(".material-pick-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMaterialCategory = btn.dataset.cat;
      renderMaterialPicker();
    });
  });
}

function syncPhotoTitleLastSaved(photos) {
  for (const ph of photos || []) {
    const t = (ph.title ?? ph.comment ?? "").trim();
    photoTitleLastSaved.set(ph.id, t);
  }
}

function capturePhotoTitlesFromDom() {
  const list = $("photo-list");
  if (!list) return;
  list.querySelectorAll(".photo-title-input").forEach((inp) => {
    const photoId = inp.dataset.photoId;
    const title = inp.value.trim();
    const ph = cachedPhotos.find((p) => p.id === photoId);
    if (ph) {
      ph.title = title;
      ph.comment = title;
    }
  });
}

function showPhotoTitleStatus(photoId, msg, isError = false) {
  const el = $("photo-list")?.querySelector(`.photo-title-status[data-photo-id="${photoId}"]`);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("photo-title-status-error", isError);
  el.classList.toggle("visible", !!msg);
  if (!isError && msg) {
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = "";
        el.classList.remove("visible");
      }
    }, 2200);
  }
}

async function flushPhotoTitlesFromDom({ quiet = true } = {}) {
  const list = $("photo-list");
  if (!list || !currentProjectId) return;
  const inputs = [...list.querySelectorAll(".photo-title-input")];
  await Promise.all(
    inputs.map(async (inp) => {
      const photoId = inp.dataset.photoId;
      const title = inp.value.trim();
      if (photoTitleLastSaved.get(photoId) === title) return;
      try {
        await savePhotoTitle(photoId, title, { quiet });
      } catch {
        /* savePhotoTitle shows inline error */
      }
    })
  );
}

function renderPhotos(photos) {
  cachedPhotos = photos || [];
  syncPhotoTitleLastSaved(cachedPhotos);
  photoDisplayLimit = Math.min(PHOTO_BATCH, cachedPhotos.length || PHOTO_BATCH);
  paintPhotoGrid();
}

function paintPhotoGrid() {
  capturePhotoTitlesFromDom();
  const el = $("photo-list");
  const countEl = $("photo-count");
  const moreBtn = $("btn-load-more-photos");
  if (!cachedPhotos.length) {
    el.innerHTML = "";
    countEl.classList.add("hidden");
    moreBtn.classList.add("hidden");
    return;
  }
  const visible = cachedPhotos.slice(0, photoDisplayLimit);
  el.innerHTML = `<div class="photo-grid">${paintPhotoGridHtml(visible)}</div>`;
  bindPhotoTitleInputs();
  bindPhotoPreviewButtons();
  bindPhotoReorderButtons();
  bindPhotoDeleteButtons();
  countEl.textContent = `写真 ${cachedPhotos.length} 枚（${visible.length} 枚表示）`;
  countEl.classList.remove("hidden");
  if (cachedPhotos.length > photoDisplayLimit) {
    moreBtn.classList.remove("hidden");
    moreBtn.textContent = `さらに表示（残り ${cachedPhotos.length - photoDisplayLimit} 枚）`;
  } else {
    moreBtn.classList.add("hidden");
  }
}

function renderMaterials(materials) {
  const el = $("material-list");
  if (!materials?.length) {
    el.innerHTML = '<p style="color:var(--tisly-muted);font-size:0.9rem;">まだ部材がありません</p>';
    return;
  }
  el.innerHTML = materials
    .map(
      (m) =>
        `<div class="material-card">
          <span class="material-icon">${MATERIAL_ICONS[m.category] || "📦"}</span>
          <div>
            <strong>${escapeHtml(MATERIAL_LABELS[m.category] || m.category)}</strong> × ${m.quantity}<br>
            <span>${escapeHtml(m.itemLabel || "")}</span>
            ${m.memo ? `<br><small style="color:var(--tisly-muted)">${escapeHtml(m.memo)}</small>` : ""}
          </div>
        </div>`
    )
    .join("");
}

function renderIpEquipment(items) {
  const el = $("ip-equipment-list");
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = '<p style="color:var(--tisly-muted);font-size:0.9rem;">まだ設備がありません</p>';
    return;
  }
  el.innerHTML = items
    .map(
      (item) =>
        `<div class="material-card" data-ip-id="${escapeHtml(item.id)}">
          <span class="material-icon">🌐</span>
          <div>
            <strong>${escapeHtml(item.deviceName || "—")}</strong>
            ${item.deviceType ? ` <span style="color:var(--tisly-muted)">[${escapeHtml(item.deviceType)}]</span>` : ""}<br>
            ${item.location ? `<span>${escapeHtml(item.location)}</span><br>` : ""}
            ${item.ipAddress ? `<span>IP: ${escapeHtml(item.ipAddress)}</span>` : ""}
            ${item.loginId ? ` · ID: ${escapeHtml(item.loginId)}` : ""}
            ${item.memo ? `<br><small style="color:var(--tisly-muted)">${escapeHtml(item.memo)}</small>` : ""}
          </div>
          <button type="button" class="btn-sub" data-action="delete-ip" style="margin-left:auto;">削除</button>
        </div>`
    )
    .join("");
  el.querySelectorAll('[data-action="delete-ip"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest("[data-ip-id]");
      if (!card || !currentProjectId) return;
      try {
        await api(`/projects/${currentProjectId}/ip-equipment/${encodeURIComponent(card.dataset.ipId)}`, {
          method: "DELETE",
        });
        toast("設備を削除しました");
        await openDetail(currentProjectId);
      } catch (e) {
        toastError(e, e.status);
      }
    });
  });
}

function formatCustomerSiteMeta(p) {
  const parts = [
    p.projectNo,
    p.customerName && `依頼主: ${p.customerName}`,
    p.siteName && `現場: ${p.siteName}`,
    p.address && `工事場所: ${p.address}`,
    p.assignee && `担当: ${p.assignee}`,
    p.phone,
    p.email,
    p.surveyDate && `現調日: ${p.surveyDate}`,
  ].filter(Boolean);
  return parts.map((x) => escapeHtml(x)).join("<br>");
}

function showDetailMemoStatus(msg, isError = false) {
  const el = $("detail-memo-status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("photo-title-status-error", isError);
  el.classList.toggle("visible", !!msg);
  if (!isError && msg) {
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = "";
        el.classList.remove("visible");
      }
    }, 2200);
  }
}

async function saveProjectNotesFromDetail({ quiet = false } = {}) {
  if (!currentProjectId) return;
  const textarea = $("detail-memo");
  if (!textarea) return;
  const notes = textarea.value;
  if (projectNotesLastSaved === notes) return;
  try {
    await api(`/projects/${currentProjectId}`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    });
    projectNotesLastSaved = notes;
    showDetailMemoStatus(PROJECT_MEMO_SAVE_OK);
    if (!quiet) toast(PROJECT_MEMO_SAVE_OK);
  } catch (e) {
    showDetailMemoStatus(PROJECT_MEMO_SAVE_FAIL, true);
    if (!quiet) toastError(e, e.status);
    throw e;
  }
}

function flushProjectNotesKeepalive() {
  if (!currentProjectId) return;
  const textarea = $("detail-memo");
  if (!textarea) return;
  const notes = textarea.value;
  if (projectNotesLastSaved === notes) return;
  const token = getCustomerToken();
  fetch(`${API}/projects/${currentProjectId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ notes }),
    keepalive: true,
  });
  projectNotesLastSaved = notes;
}

function bindDetailMemoInput() {
  if (detailMemoBound) return;
  detailMemoBound = true;
  const textarea = $("detail-memo");
  if (!textarea) return;
  const persist = async (quiet = false) => {
    try {
      await saveProjectNotesFromDetail({ quiet });
    } catch {
      /* inline status shown in saveProjectNotesFromDetail */
    }
  };
  textarea.addEventListener("input", () => {
    showDetailMemoStatus("");
    if (detailMemoSaveTimer) clearTimeout(detailMemoSaveTimer);
    detailMemoSaveTimer = setTimeout(() => {
      detailMemoSaveTimer = null;
      persist(true);
    }, 600);
  });
  textarea.addEventListener("change", () => persist(false));
  textarea.addEventListener("blur", () => {
    if (detailMemoSaveTimer) {
      clearTimeout(detailMemoSaveTimer);
      detailMemoSaveTimer = null;
    }
    persist(false);
  });
}

function drawingEditorQuery(sketchId) {
  const q = new URLSearchParams();
  if (sketchId) q.set("sketchId", sketchId);
  if (currentProjectId) q.set("projectId", currentProjectId);
  if (currentSiteId) q.set("siteId", currentSiteId);
  if (currentCustomerId) q.set("customerId", currentCustomerId);
  return q.toString();
}

function drawingEditorUrl(sketchId) {
  return `/survey-drawing-v1?${drawingEditorQuery(sketchId)}`;
}

function drawingEditorNewUrl() {
  return `/survey-drawing-v1?${drawingEditorQuery()}`;
}

async function renderDrawingSketches() {
  const mount = $("drawing-sketch-list");
  if (!mount || !currentProjectId) return;
  try {
    const data = await api(`/projects/${currentProjectId}/drawing-sketches`);
    const sketches = data.sketches || [];
    if (!sketches.length) {
      mount.innerHTML = `<p class="section-hint">図面はまだありません。作成して方眼紙写真を取り込んでください。</p>`;
      return;
    }
    mount.innerHTML = sketches
      .map(
        (s) =>
          `<p><a class="btn-sub" style="display:inline-block;margin:0.25rem 0;" href="${drawingEditorUrl(s.id)}">${escapeHtml(s.title)}</a> <span class="section-hint">${s.backgroundImageUrl ? "📷 背景あり" : "下書き"} · ${escapeHtml(s.updatedAt?.slice(0, 16) || "")}</span></p>`
      )
      .join("");
  } catch {
    mount.innerHTML = `<p class="section-hint">図面一覧を読み込めませんでした</p>`;
  }
}

async function openDetail(projectId) {
  if (currentProjectId) {
    await flushPhotoTitlesFromDom({ quiet: true });
    await saveProjectNotesFromDetail({ quiet: true }).catch(() => {});
  }
  currentProjectId = projectId;
  photoDisplayLimit = PHOTO_BATCH;
  showView("detail");
  try {
    const p = await api(`/projects/${projectId}`);
    currentSiteId = p.siteId || p.projectId || null;
    currentCustomerId = p.customerId || p.customerCode || null;
    $("detail-name").textContent = p.siteName || p.customerName;
    const statusEl = $("detail-status");
    statusEl.textContent = WORKFLOW_LABELS[p.workflowStatus] || p.workflowStatus;
    statusEl.className = statusBadgeClass(p.workflowStatus);
    $("detail-meta").innerHTML = formatCustomerSiteMeta(p);
    const memoEl = $("detail-memo");
    if (memoEl) {
      memoEl.value = p.notes || "";
      projectNotesLastSaved = p.notes || "";
      showDetailMemoStatus("");
    }
    bindDetailMemoInput();
    renderPhotos(p.photos);
    selectedWorkTypes = new Set(p.workTypes || []);
    renderWorkTypeGrid("detail-work-types", p.workTypes || []);
    const templates = await loadWorkTemplates();
    try {
      const applied = await api(`/projects/${projectId}/work-templates`);
      selectedTemplateIds = new Set(applied.templateIds || []);
    } catch {
      selectedTemplateIds = new Set();
    }
    renderTemplateList("detail-work-templates", templates, [...selectedTemplateIds]);
    renderMaterials(p.materials);
    renderIpEquipment(p.ipEquipment || []);
    await renderDrawingSketches();
    const handoffBtn = $("btn-handoff");
    const handoffInfo = $("handoff-info");
    if (p.workflowStatus === "estimate_pending" || p.handoff) {
      handoffBtn.disabled = true;
      handoffBtn.textContent = "見積もり作成待ち（送り済み）";
      handoffInfo.classList.remove("hidden");
      handoffInfo.innerHTML = p.handoff
        ? `送った日時: ${escapeHtml(p.handoff.handoffAt)} · <a href="/estimate-v1">見積アプリで開く</a>`
        : "";
    } else {
      handoffBtn.disabled = false;
      handoffBtn.textContent = "見積へ送る";
      handoffInfo.classList.add("hidden");
    }
  } catch (e) {
    toastError(e, e.status);
    showView("list");
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
      console.warn("[survey-v1] createImageBitmap failed", err, file.name);
    }
  }
  const dataUrl = String(await readFileAsDataUrl(file));
  const img = await loadImageFromDataUrl(dataUrl);
  return { source: img, width: img.width, height: img.height, cleanup: () => {} };
}

function canvasToJpegBase64(canvas, quality = 0.82) {
  let out;
  try {
    out = canvas.toDataURL("image/jpeg", quality);
  } catch (err) {
    console.error("[survey-v1] canvas.toDataURL failed", err);
    throw err;
  }
  if (!out || out.length < 32) throw new Error("compression failed");
  const b64 = out.split(",")[1];
  if (!b64 || b64.length < 16) throw new Error("empty base64");
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

async function fileToBase64(file) {
  const dataUrl = String(await readFileAsDataUrl(file));
  const b64 = dataUrl.split(",")[1];
  if (!b64) throw new Error("base64 empty");
  return b64;
}

function revokePendingPreviews() {
  pendingPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  pendingPreviewUrls = [];
}

function showPhotoPreviews(files) {
  revokePendingPreviews();
  const el = $("photo-list");
  const previews = files
    .map((file) => {
      const url = URL.createObjectURL(file);
      pendingPreviewUrls.push(url);
      return `<div class="photo-card photo-pending"><img src="${url}" alt="" /><div class="photo-caption">送信中…</div></div>`;
    })
    .join("");
  const existing = cachedPhotos.length
    ? paintPhotoGridHtml(cachedPhotos.slice(0, photoDisplayLimit))
    : "";
  el.innerHTML = `<div class="photo-grid">${previews}${existing}</div>`;
}

function paintPhotoGridHtml(visible) {
  return visible
    .map((ph) => {
      const fullIdx = cachedPhotos.findIndex((p) => p.id === ph.id);
      const canUp = fullIdx > 0;
      const canDown = fullIdx >= 0 && fullIdx < cachedPhotos.length - 1;
      const img = ph.url
        ? `<button type="button" class="photo-preview-btn" data-photo-id="${ph.id}" aria-label="写真を拡大表示"><img src="${ph.url}" alt="" loading="lazy" decoding="async" /></button>`
        : '<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:#eee;font-size:2rem;">📝</div>';
      const title = ph.title ?? ph.comment ?? "";
      const placeholder = PHOTO_TITLE_PLACEHOLDERS[fullIdx % PHOTO_TITLE_PLACEHOLDERS.length];
      const titleField = ph.url
        ? `<label class="photo-title-label"><span class="photo-title-label-text">写真タイトル</span><input type="text" class="photo-title-input" data-photo-id="${ph.id}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(title)}" inputmode="text" enterkeyhint="done" autocomplete="off" maxlength="120" /><span class="photo-title-status" data-photo-id="${ph.id}" aria-live="polite"></span></label>`
        : `<div class="photo-caption">${escapeHtml(title || "（メモ）")}</div>`;
      return `<div class="photo-card" data-photo-id="${ph.id}">
        <div class="photo-card-top"><button type="button" class="photo-delete-btn" data-photo-id="${ph.id}">削除</button></div>
        ${img}${titleField}
        <div class="photo-reorder-row">
          <button type="button" class="photo-reorder-btn" data-photo-id="${ph.id}" data-direction="up" ${canUp ? "" : "disabled"}>↑ 上へ</button>
          <button type="button" class="photo-reorder-btn" data-photo-id="${ph.id}" data-direction="down" ${canDown ? "" : "disabled"}>↓ 下へ</button>
        </div>
        <small style="display:block;padding:0 0.4rem 0.35rem;color:var(--tisly-muted);font-size:0.7rem;">${escapeHtml(ph.takenAt || ph.createdAt || "")}</small>
      </div>`;
    })
    .join("");
}

const photoTitleSaveTimers = new Map();
const photoTitleLastSaved = new Map();
let photoTitleIosFlushBound = false;

async function savePhotoTitle(photoId, title, { quiet = false } = {}) {
  if (!currentProjectId || !photoId) return;
  const normalized = title.trim();
  if (photoTitleLastSaved.get(photoId) === normalized) return;
  try {
    await api(`/projects/${currentProjectId}/photos/${photoId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: normalized }),
    });
    photoTitleLastSaved.set(photoId, normalized);
    const ph = cachedPhotos.find((p) => p.id === photoId);
    if (ph) {
      ph.title = normalized;
      ph.comment = normalized;
    }
    showPhotoTitleStatus(photoId, PHOTO_TITLE_SAVE_OK);
    if (!quiet) toast(PHOTO_TITLE_SAVE_OK);
  } catch (e) {
    showPhotoTitleStatus(photoId, PHOTO_TITLE_SAVE_FAIL, true);
    if (!quiet) toast(PHOTO_TITLE_SAVE_FAIL);
    throw e;
  }
}

function clearPhotoTitleSaveTimer(photoId) {
  if (photoTitleSaveTimers.has(photoId)) {
    clearTimeout(photoTitleSaveTimers.get(photoId));
    photoTitleSaveTimers.delete(photoId);
  }
}

function flushPhotoTitlesKeepalive() {
  const list = $("photo-list");
  if (!list || !currentProjectId) return;
  const token = getCustomerToken();
  list.querySelectorAll(".photo-title-input").forEach((inp) => {
    const photoId = inp.dataset.photoId;
    const title = inp.value.trim();
    if (photoTitleLastSaved.get(photoId) === title) return;
    fetch(`${API}/projects/${currentProjectId}/photos/${photoId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title }),
      keepalive: true,
    });
    photoTitleLastSaved.set(photoId, title);
  });
}

function bindPhotoTitleIosFlush() {
  if (photoTitleIosFlushBound) return;
  photoTitleIosFlushBound = true;
  const flushOnExit = () => {
    flushPhotoTitlesKeepalive();
    flushProjectNotesKeepalive();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnExit();
  });
  window.addEventListener("pagehide", flushOnExit);
}

function bindPhotoTitleInputs() {
  bindPhotoTitleIosFlush();
  $("photo-list").querySelectorAll(".photo-title-input").forEach((inp) => {
    inp.addEventListener("click", (ev) => ev.stopPropagation());
    inp.addEventListener("touchstart", (ev) => ev.stopPropagation(), { passive: true });
    const persist = async (quiet = false) => {
      if (!currentProjectId) return;
      const photoId = inp.dataset.photoId;
      const title = inp.value.trim();
      try {
        await savePhotoTitle(photoId, title, { quiet });
      } catch {
        /* inline status shown in savePhotoTitle */
      }
    };
    inp.addEventListener("input", () => {
      const photoId = inp.dataset.photoId;
      showPhotoTitleStatus(photoId, "");
      clearPhotoTitleSaveTimer(photoId);
      photoTitleSaveTimers.set(
        photoId,
        setTimeout(() => {
          photoTitleSaveTimers.delete(photoId);
          persist(true);
        }, 600)
      );
    });
    inp.addEventListener("change", () => persist(false));
    inp.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      clearPhotoTitleSaveTimer(inp.dataset.photoId);
      persist(false);
      inp.blur();
    });
    inp.addEventListener("blur", () => {
      clearPhotoTitleSaveTimer(inp.dataset.photoId);
      persist(false);
    });
  });
}

let photoEditorState = null;
let photoPreviewState = null;

function imagePhotosForPreview() {
  return cachedPhotos.filter((p) => p.url);
}

function formatPhotoDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paintPhotoPreviewAt(index) {
  const st = photoPreviewState;
  if (!st) return;
  const ph = st.photos[index];
  if (!ph) return;
  st.index = index;
  const img = $("photo-preview-img");
  img.src = ph.url;
  img.alt = ph.title || ph.comment || "現場写真";
  const title = (ph.title ?? ph.comment ?? "").trim();
  $("photo-preview-title").textContent = title || "（タイトルなし）";
  $("photo-preview-date").textContent = formatPhotoDateTime(ph.takenAt || ph.createdAt);
  $("photo-preview-prev").disabled = index <= 0;
  $("photo-preview-next").disabled = index >= st.photos.length - 1;
}

function getPreviewInertRoot() {
  return document.querySelector(".app-main");
}

function bindPreviewTap(el, handler) {
  if (!el) return;
  let touchHandled = false;
  const run = (ev) => {
    ev.stopPropagation();
    handler(ev);
  };
  el.addEventListener("touchend", (ev) => {
    touchHandled = true;
    run(ev);
    ev.preventDefault();
  }, { passive: false });
  el.addEventListener("click", (ev) => {
    if (touchHandled) {
      touchHandled = false;
      return;
    }
    run(ev);
  });
}

function bindPreviewDismiss(el, handler) {
  bindPreviewTap(el, handler);
}

function openPhotoPreview(photoId) {
  const photos = imagePhotosForPreview();
  const index = photos.findIndex((p) => p.id === photoId);
  if (index < 0) return;
  photoPreviewState = { index, photos };
  paintPhotoPreviewAt(index);
  const modal = $("photo-preview-modal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("photo-preview-open");
  getPreviewInertRoot()?.setAttribute("inert", "");
}

function closePhotoPreview() {
  photoPreviewState = null;
  const modal = $("photo-preview-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("photo-preview-open");
  getPreviewInertRoot()?.removeAttribute("inert");
  const img = $("photo-preview-img");
  if (img) img.removeAttribute("src");
}

function initPhotoPreview() {
  const modal = $("photo-preview-modal");
  if (!modal) return;

  bindPreviewDismiss($("photo-preview-backdrop"), closePhotoPreview);
  $("photo-preview-stage")?.addEventListener("click", (ev) => {
    if (ev.target === ev.currentTarget) closePhotoPreview();
  });
  bindPreviewDismiss($("photo-preview-close-x"), closePhotoPreview);
  bindPreviewDismiss($("photo-preview-close"), closePhotoPreview);

  bindPreviewDismiss($("photo-preview-prev"), () => {
    if (!photoPreviewState || photoPreviewState.index <= 0) return;
    paintPhotoPreviewAt(photoPreviewState.index - 1);
  });

  bindPreviewDismiss($("photo-preview-next"), () => {
    if (!photoPreviewState || photoPreviewState.index >= photoPreviewState.photos.length - 1) return;
    paintPhotoPreviewAt(photoPreviewState.index + 1);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && photoPreviewState) closePhotoPreview();
  });
}

function bindPhotoPreviewButtons() {
  $("photo-list").querySelectorAll(".photo-preview-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openPhotoPreview(btn.dataset.photoId);
    });
  });
}

async function movePhoto(photoId, direction) {
  if (!currentProjectId || !photoId) return;
  await flushPhotoTitlesFromDom({ quiet: true });
  const idx = cachedPhotos.findIndex((p) => p.id === photoId);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= cachedPhotos.length) return;

  const next = cachedPhotos.slice();
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  cachedPhotos = next;
  paintPhotoGrid();

  try {
    const result = await api(`/projects/${currentProjectId}/photos/${photoId}/move`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    });
    if (Array.isArray(result.photos)) {
      cachedPhotos = result.photos;
      paintPhotoGrid();
    }
  } catch (e) {
    await openDetail(currentProjectId);
    toastError(e, e.status);
  }
}

function bindPhotoReorderButtons() {
  $("photo-list").querySelectorAll(".photo-reorder-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (btn.disabled) return;
      await movePhoto(btn.dataset.photoId, btn.dataset.direction);
    });
  });
}

async function deletePhoto(photoId) {
  if (!currentProjectId || !photoId) return;
  if (!confirm("この写真を削除しますか？")) return;
  await flushPhotoTitlesFromDom({ quiet: true });
  try {
    await api(`/projects/${currentProjectId}/photos/${photoId}`, { method: "DELETE" });
    cachedPhotos = cachedPhotos.filter((p) => p.id !== photoId);
    paintPhotoGrid();
    toast("写真を削除しました");
  } catch (e) {
    toastError(e, e.status);
  }
}

function bindPhotoDeleteButtons() {
  $("photo-list").querySelectorAll(".photo-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await deletePhoto(btn.dataset.photoId);
    });
  });
}

function setPhotoEditorTool(tool) {
  if (!photoEditorState) return;
  photoEditorState.tool = tool;
  document.querySelectorAll(".photo-editor-tool").forEach((el) => {
    el.classList.toggle("active", el.dataset.tool === tool);
  });
}

function photoEditorPoint(ev, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clientX = ev.touches?.[0]?.clientX ?? ev.clientX;
  const clientY = ev.touches?.[0]?.clientY ?? ev.clientY;
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawPhotoEditorShape(ctx, shape) {
  ctx.save();
  ctx.strokeStyle = "#e11d48";
  ctx.fillStyle = "#e11d48";
  ctx.lineWidth = Math.max(3, ctx.canvas.width * 0.004);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (shape.type === "pen" && shape.points?.length > 1) {
    ctx.beginPath();
    shape.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  } else if (shape.type === "arrow") {
    const { x1, y1, x2, y2 } = shape;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(12, ctx.lineWidth * 4);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  } else if (shape.type === "circle") {
    const rx = Math.abs(shape.x2 - shape.x1) / 2;
    const ry = Math.abs(shape.y2 - shape.y1) / 2;
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape.type === "text" && shape.text) {
    const size = Math.max(18, ctx.canvas.width * 0.028);
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.fillText(shape.text, shape.x, shape.y);
  }
  ctx.restore();
}

function redrawPhotoEditorCanvas() {
  const st = photoEditorState;
  if (!st) return;
  const { baseCtx, drawCtx, baseCanvas, drawCanvas, shapes } = st;
  baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
  baseCtx.drawImage(st.image, 0, 0, baseCanvas.width, baseCanvas.height);
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  shapes.forEach((shape) => drawPhotoEditorShape(drawCtx, shape));
}

async function openPhotoEditor(photo) {
  const overlay = $("photo-editor");
  const baseCanvas = $("photo-editor-base");
  const drawCanvas = $("photo-editor-draw");
  if (!overlay || !baseCanvas || !drawCanvas) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("image load failed"));
    img.src = photo.url;
  });
  const maxW = Math.min(1200, window.innerWidth - 24);
  let width = img.width;
  let height = img.height;
  if (width > maxW) {
    height = Math.round((height * maxW) / width);
    width = maxW;
  }
  baseCanvas.width = width;
  baseCanvas.height = height;
  drawCanvas.width = width;
  drawCanvas.height = height;
  const baseCtx = baseCanvas.getContext("2d");
  const drawCtx = drawCanvas.getContext("2d");
  photoEditorState = {
    photo,
    image: img,
    tool: "pen",
    shapes: [],
    draft: null,
    baseCanvas,
    drawCanvas,
    baseCtx,
    drawCtx,
  };
  redrawPhotoEditorCanvas();
  setPhotoEditorTool("pen");
  overlay.classList.remove("hidden");
  document.body.classList.add("photo-editor-open");
}

function closePhotoEditor() {
  photoEditorState = null;
  $("photo-editor")?.classList.add("hidden");
  document.body.classList.remove("photo-editor-open");
}

function initPhotoEditor() {
  const overlay = $("photo-editor");
  const drawCanvas = $("photo-editor-draw");
  if (!overlay || !drawCanvas) return;

  overlay.querySelectorAll(".photo-editor-tool").forEach((btn) => {
    btn.addEventListener("click", () => setPhotoEditorTool(btn.dataset.tool));
  });
  $("photo-editor-cancel")?.addEventListener("click", closePhotoEditor);
  $("photo-editor-undo")?.addEventListener("click", () => {
    if (!photoEditorState?.shapes.length) return;
    photoEditorState.shapes.pop();
    redrawPhotoEditorCanvas();
  });

  const finishDraft = () => {
    const st = photoEditorState;
    if (!st?.draft) return;
    if (st.draft.type === "pen" && st.draft.points?.length > 1) st.shapes.push(st.draft);
    else if (st.draft.type === "arrow" || st.draft.type === "circle") st.shapes.push(st.draft);
    st.draft = null;
    redrawPhotoEditorCanvas();
  };

  const onPointerDown = (ev) => {
    if (!photoEditorState) return;
    ev.preventDefault();
    const pt = photoEditorPoint(ev, drawCanvas);
    const st = photoEditorState;
    if (st.tool === "text") {
      const text = window.prompt("文字を入力", "");
      if (text?.trim()) {
        st.shapes.push({ type: "text", x: pt.x, y: pt.y, text: text.trim() });
        redrawPhotoEditorCanvas();
      }
      return;
    }
    if (st.tool === "pen") {
      st.draft = { type: "pen", points: [pt] };
    } else {
      st.draft = { type: st.tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    }
    drawCanvas.setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev) => {
    if (!photoEditorState?.draft) return;
    ev.preventDefault();
    const pt = photoEditorPoint(ev, drawCanvas);
    const st = photoEditorState;
    if (st.draft.type === "pen") {
      st.draft.points.push(pt);
      redrawPhotoEditorCanvas();
      drawPhotoEditorShape(st.drawCtx, st.draft);
    } else {
      st.draft.x2 = pt.x;
      st.draft.y2 = pt.y;
      redrawPhotoEditorCanvas();
      drawPhotoEditorShape(st.drawCtx, st.draft);
    }
  };

  const onPointerUp = (ev) => {
    if (!photoEditorState?.draft) return;
    ev.preventDefault();
    finishDraft();
    drawCanvas.releasePointerCapture?.(ev.pointerId);
  };

  drawCanvas.addEventListener("pointerdown", onPointerDown);
  drawCanvas.addEventListener("pointermove", onPointerMove);
  drawCanvas.addEventListener("pointerup", onPointerUp);
  drawCanvas.addEventListener("pointercancel", onPointerUp);

  $("photo-editor-save")?.addEventListener("click", async () => {
    const st = photoEditorState;
    if (!st || !currentProjectId) return;
    try {
      const merged = document.createElement("canvas");
      merged.width = st.baseCanvas.width;
      merged.height = st.baseCanvas.height;
      const ctx = merged.getContext("2d");
      ctx.drawImage(st.baseCanvas, 0, 0);
      ctx.drawImage(st.drawCanvas, 0, 0);
      const imageBase64 = canvasToJpegBase64(merged, 0.88);
      await api(`/projects/${currentProjectId}/photos/${st.photo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ imageBase64, fileName: "annotated.jpg" }),
      });
      toast("編集した写真を保存しました");
      closePhotoEditor();
      await openDetail(currentProjectId);
    } catch (e) {
      console.error("[survey-v1] photo editor save failed", e);
      toastError(e, e.status);
    }
  });
}

async function uploadPhotos(files) {
  if (!currentProjectId || !files?.length) return;
  const imageFiles = [...files].filter(isLikelyImageFile);
  if (!imageFiles.length) {
    console.error("[survey-v1] no image files after filter", [...files].map((f) => ({ name: f.name, type: f.type, size: f.size })));
    toast(PHOTO_FAIL_MSG);
    return;
  }
  const currentImageCount = cachedPhotos.filter((p) => p.url).length;
  const room = MAX_PHOTOS - currentImageCount;
  if (room <= 0) {
    toast(`写真は最大${MAX_PHOTOS}枚までです`);
    return;
  }
  const batch = imageFiles.slice(0, room);
  if (batch.length < imageFiles.length) {
    toast(`残り${room}枚分だけ追加します（上限${MAX_PHOTOS}枚）`);
  }
  showPhotoPreviews(batch);
  const progress = $("photo-upload-progress");
  progress.classList.remove("hidden");
  let done = 0;
  let failed = false;
  for (const file of batch) {
    progress.textContent = `アップロード中… ${done + 1} / ${batch.length}`;
    try {
      let imageBase64;
      try {
        imageBase64 = await compressImage(file);
      } catch (compressErr) {
        console.warn("[survey-v1] compress failed", compressErr, file.name);
        if (isHeicLike(file)) {
          throw Object.assign(new Error("heic decode failed"), { status: 400, heic: true });
        }
        imageBase64 = await fileToBase64(file);
      }
      await api(`/projects/${currentProjectId}/photos`, {
        method: "POST",
        body: JSON.stringify({
          imageBase64,
          fileName: (file.name || "photo").replace(/\.[^.]+$/, ".jpg"),
          takenAt: new Date().toISOString(),
        }),
      });
      done += 1;
    } catch (e) {
      failed = true;
      console.error("[survey-v1] photo upload failed", e, { name: file.name, type: file.type, status: e.status });
      if (e.status === 401) {
        toast("ログインが切れました。もう一度ログインしてください");
      } else if (e.status === 413) {
        toast("写真が大きすぎます。別の写真で試してください");
      } else if (e.heic) {
        toast("HEIC形式は変換できませんでした。JPEGで保存した写真を選んでください");
      } else {
        toast(PHOTO_FAIL_MSG);
      }
      break;
    }
  }
  revokePendingPreviews();
  progress.classList.add("hidden");
  $("photo-comment").value = "";
  if (!failed && done === batch.length) {
    toast(`写真を${done}枚追加しました`);
  }
  await openDetail(currentProjectId);
}

function handleBack() {
  if (!$("view-edit").classList.contains("hidden") && currentProjectId) {
    openDetail(currentProjectId);
    return;
  }
  if (!$("view-detail").classList.contains("hidden")) {
    showView("list");
    loadList();
    return;
  }
  if (!$("view-form").classList.contains("hidden")) {
    showView("list");
    return;
  }
  showView("list");
}

function projectBodyFromForm(fd) {
  const workTypes = getSelectedWorkTypesFromDom("form-work-types");
  return {
    customerCode: customerCodeFromPath(),
    customerName: fd.get("customerName"),
    customerAddress: fd.get("customerAddress") || undefined,
    siteName: fd.get("siteName") || undefined,
    address: fd.get("address") || undefined,
    phone: fd.get("phone") || undefined,
    email: fd.get("email") || undefined,
    assignee: fd.get("assignee") || undefined,
    surveyDate: fd.get("surveyDate") || undefined,
    notes: String(fd.get("notes") ?? ""),
    workTypes,
  };
}

function getSelectedTemplateIdsFromDom(containerId) {
  const el = $(containerId);
  if (!el) return [];
  return [...el.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
}

async function init() {
  const session = await requireCustomerLogin(customerCodeFromPath());
  surveyIsStorageAdmin = ["owner", "admin", "super_admin"].includes(session?.role);
  $("ip-password-wrap")?.classList.toggle("hidden", !surveyIsStorageAdmin);
  practicalNav = initPracticalNav({
    appId: "survey_v1",
    appName: "現調",
    theme: "green",
    onBack: handleBack,
  });
  practicalNav.setToast(toast);
  initPhotoPreview();
  initPhotoEditor();
  renderMaterialPicker();
  renderWorkTypeGrid("form-work-types", []);
  loadWorkTemplates().then((tpls) => renderTemplateList("form-work-templates", tpls)).catch(console.error);
  showView("list");
  await loadList();

  const params = new URLSearchParams(location.search);
  const projectId = params.get("project") || params.get("projectId");
  if (projectId) await openDetail(projectId);

  $("btn-new").addEventListener("click", () => {
    currentProjectId = null;
    $("project-form").reset();
    $("form-error").classList.add("hidden");
    showView("form");
  });

  $("project-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      const created = await api("/projects", { method: "POST", body: JSON.stringify(projectBodyFromForm(fd)) });
      const templateIds = getSelectedTemplateIdsFromDom("form-work-templates");
      if (templateIds.length) {
        await api(`/projects/${created.projectId}/work-templates`, {
          method: "POST",
          body: JSON.stringify({ templateIds }),
        });
      }
      toast("保存しました");
      await openDetail(created.projectId);
    } catch (e) {
      showFriendlyError("form-error", e, e.status);
    }
  });

  $("btn-save-work-types").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const workTypes = getSelectedWorkTypesFromDom("detail-work-types");
      await api(`/projects/${currentProjectId}`, {
        method: "PATCH",
        body: JSON.stringify({ workTypes }),
      });
      toast("工事種別を保存しました");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-apply-templates").addEventListener("click", async () => {
    if (!currentProjectId) return;
    const templateIds = getSelectedTemplateIdsFromDom("detail-work-templates");
    if (!templateIds.length) {
      toast("テンプレートを1つ以上選んでください");
      return;
    }
    try {
      const result = await api(`/projects/${currentProjectId}/work-templates`, {
        method: "POST",
        body: JSON.stringify({ templateIds }),
      });
      const info = $("template-apply-result");
      info.classList.remove("hidden");
      info.textContent = `発注 ${result.purchaseLineCount}件 / 部材 ${result.surveyMaterialCount}件を生成（材料チェックは日程・案件から手動登録）`;
      toast("テンプレートを適用しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-camera").addEventListener("click", () => $("file-input-camera").click());
  $("btn-library").addEventListener("click", () => $("file-input-library").click());

  $("file-input-camera").addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = "";
    await uploadPhotos(files);
  });

  $("file-input-library").addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = "";
    await uploadPhotos(files);
  });

  $("btn-load-more-photos").addEventListener("click", async () => {
    await flushPhotoTitlesFromDom({ quiet: true });
    photoDisplayLimit = Math.min(photoDisplayLimit + PHOTO_BATCH, cachedPhotos.length);
    paintPhotoGrid();
  });

  $("btn-photo-memo").addEventListener("click", async () => {
    if (!currentProjectId) return;
    const comment = $("photo-comment").value.trim();
    if (!comment) {
      toast("メモの内容を入力してください");
      return;
    }
    try {
      await api(`/projects/${currentProjectId}/photos`, {
        method: "POST",
        body: JSON.stringify({ comment, takenAt: new Date().toISOString() }),
      });
      $("photo-comment").value = "";
      toast("メモを追加しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-add-material").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      await api(`/projects/${currentProjectId}/materials`, {
        method: "POST",
        body: JSON.stringify({
          category: selectedMaterialCategory,
          itemLabel: $("material-label").value,
          quantity: Number($("material-qty").value) || 1,
          memo: $("material-memo").value,
        }),
      });
      $("material-label").value = "";
      $("material-memo").value = "";
      $("material-qty").value = "1";
      toast("部材を追加しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-add-ip-equipment")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    const body = {
      deviceName: $("ip-device-name")?.value ?? "",
      deviceType: $("ip-device-type")?.value ?? "",
      location: $("ip-location")?.value ?? "",
      ipAddress: $("ip-address")?.value ?? "",
      loginId: $("ip-login-id")?.value ?? "",
      memo: $("ip-memo")?.value ?? "",
    };
    if (surveyIsStorageAdmin && $("ip-password")?.value) {
      body.password = $("ip-password").value;
    }
    try {
      await api(`/projects/${currentProjectId}/ip-equipment`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      ["ip-device-name", "ip-device-type", "ip-location", "ip-address", "ip-login-id", "ip-password", "ip-memo"].forEach(
        (id) => {
          const el = $(id);
          if (el) el.value = "";
        }
      );
      toast("設備を追加しました");
      await openDetail(currentProjectId);
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("btn-edit").addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const p = await api(`/projects/${currentProjectId}`);
      const form = $("edit-form");
      form.customerName.value = p.customerName || "";
      form.customerAddress.value = p.customerAddress || "";
      form.siteName.value = p.siteName || "";
      form.address.value = p.address || "";
      form.phone.value = p.phone || "";
      form.email.value = p.email || "";
      form.assignee.value = p.assignee || "";
      form.surveyDate.value = p.surveyDate || "";
      form.notes.value = p.notes || "";
      $("edit-error").classList.add("hidden");
      showView("edit");
    } catch (e) {
      toastError(e, e.status);
    }
  });

  $("edit-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!currentProjectId) return;
    const fd = new FormData(ev.target);
    const body = projectBodyFromForm(fd);
    delete body.customerCode;
    try {
      await api(`/projects/${currentProjectId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast("変更を保存しました");
      await openDetail(currentProjectId);
    } catch (e) {
      showFriendlyError("edit-error", e, e.status);
    }
  });

  $("btn-new-drawing")?.addEventListener("click", () => {
    if (!currentProjectId) return;
    location.href = drawingEditorNewUrl();
  });
  $("btn-open-drawing")?.addEventListener("click", async () => {
    if (!currentProjectId) return;
    try {
      const data = await api(`/projects/${currentProjectId}/drawing-sketches`);
      const first = data.sketches?.[0];
      location.href = first ? drawingEditorUrl(first.id) : drawingEditorNewUrl();
    } catch {
      location.href = drawingEditorNewUrl();
    }
  });

  $("btn-handoff").addEventListener("click", async () => {
    if (!currentProjectId) return;
    if (!confirm("見積アプリに送りますか？\n送ったあとは見積担当が料金をまとめます。")) return;
    try {
      await api(`/projects/${currentProjectId}/estimate-pending`, { method: "POST", body: "{}" });
      toast("見積へ送りました");
      await openDetail(currentProjectId);
    } catch (e) {
      toastError(e, e.status);
    }
  });
}

init().catch((e) => {
  console.error(e);
  $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
});

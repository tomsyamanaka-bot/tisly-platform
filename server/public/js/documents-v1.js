import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/documents/v1";
let favoriteOnly = false;
let currentProjectId = "";
let searchTimer = null;
let typeMeta = {};
let sourceMeta = {};
let searchSort = "recent";
let filterCategory = "all";
let filterQnap = "all";
let filterSource = "all";
let previewDownloadUrl = "";
let imageZoomed = false;

const WORKFLOW_OPTIONS = {
  estimate: ["draft", "sent", "signed", "completed", "archived"],
  invoice: ["draft", "sent", "completed", "archived"],
  report: ["draft", "sent", "completed", "archived"],
  specification: ["draft", "sent", "completed", "archived"],
  default: ["draft", "ready", "sent", "completed", "archived"],
};

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
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

function typeBadge(type) {
  const meta = typeMeta[type] || { label: type, bg: "#f1f5f9", color: "#64748b" };
  return `<span class="dc-badge" style="background:${meta.bg};color:${meta.color}">${escapeHtml(meta.label)}</span>`;
}

function sourceBadge(src) {
  const meta = sourceMeta[src] || { label: src, icon: "📎" };
  return `<span class="dc-badge" style="background:#f1f5f9;color:#64748b">${meta.icon} ${escapeHtml(meta.label)}</span>`;
}

function showHome() {
  $("view-home").classList.remove("hidden");
  $("view-project").classList.add("hidden");
  $("btn-fab-upload")?.classList.add("hidden");
  currentProjectId = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("projectId");
  window.history.replaceState({}, "", url.pathname + url.search);
}

function showProject(projectId) {
  currentProjectId = projectId;
  $("view-home").classList.add("hidden");
  $("view-project").classList.remove("hidden");
  $("btn-fab-upload")?.classList.remove("hidden");
  const url = new URL(window.location.href);
  url.searchParams.set("projectId", projectId);
  window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
}

function renderFilterChips() {
  const catEl = $("filter-category");
  const qnapEl = $("filter-qnap");
  const srcEl = $("filter-source");
  if (!catEl) return;

  const cats = [{ id: "all", label: "すべて" }, ...Object.entries(typeMeta).map(([id, m]) => ({ id, label: m.label }))];
  catEl.innerHTML = cats
    .map((c) => `<button type="button" class="dc-filter-chip${filterCategory === c.id ? " active" : ""}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`)
    .join("");
  catEl.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterCategory = btn.dataset.cat;
      renderFilterChips();
      runSearch($("search-input")?.value ?? "");
    });
  });

  const qnaps = [
    { id: "all", label: "QNAPすべて" },
    { id: "pending", label: "🟠 未保存" },
    { id: "synced", label: "🟢 保存済" },
    { id: "failed", label: "🔴 失敗" },
    { id: "syncing", label: "⚙️ 同期中" },
  ];
  qnapEl.innerHTML = qnaps
    .map((q) => `<button type="button" class="dc-filter-chip${filterQnap === q.id ? " active" : ""}" data-qnap="${q.id}">${q.label}</button>`)
    .join("");
  qnapEl.querySelectorAll("[data-qnap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterQnap = btn.dataset.qnap;
      renderFilterChips();
      runSearch($("search-input")?.value ?? "");
    });
  });

  const srcs = [{ id: "all", label: "ソースすべて" }, ...Object.entries(sourceMeta).map(([id, m]) => ({ id, label: `${m.icon} ${m.label}` }))];
  srcEl.innerHTML = srcs
    .map((s) => `<button type="button" class="dc-filter-chip${filterSource === s.id ? " active" : ""}" data-src="${s.id}">${escapeHtml(s.label)}</button>`)
    .join("");
  srcEl.querySelectorAll("[data-src]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterSource = btn.dataset.src;
      renderFilterChips();
      runSearch($("search-input")?.value ?? "");
    });
  });
}

async function loadMeta() {
  const data = await api("/meta");
  typeMeta = data.documentTypes || {};
  sourceMeta = data.sourceTypes || {};
  renderFilterChips();

  const doctypeSel = $("upload-doctype");
  const sourceSel = $("upload-source");
  if (doctypeSel) {
    doctypeSel.innerHTML = Object.entries(typeMeta)
      .map(([id, m]) => `<option value="${escapeHtml(id)}">${escapeHtml(m.folderLabel || m.label)}</option>`)
      .join("");
  }
  if (sourceSel) {
    sourceSel.innerHTML = Object.entries(sourceMeta)
      .map(([id, m]) => `<option value="${escapeHtml(id)}">${m.icon} ${escapeHtml(m.label)}</option>`)
      .join("");
  }
}

async function loadRecent() {
  const el = $("recent-list");
  try {
    const data = await api("/recent?limit=10");
    const items = data.items ?? [];
    if (!items.length) {
      el.innerHTML = '<p class="empty-hint">まだ履歴がありません</p>';
      return;
    }
    el.innerHTML = items
      .map(
        (item) => `<div class="dc-card" data-recent-project="${escapeHtml(item.projectId)}" data-recent-doc="${escapeHtml(item.documentId)}">
        <div class="dc-card-head">
          <div>
            <p class="dc-card-title">${escapeHtml(item.title)}</p>
            <p class="dc-card-meta">${escapeHtml(item.projectNo)} · ${escapeHtml(item.customerName)} · ${escapeHtml(item.fileName)}</p>
          </div>
          ${typeBadge(item.documentType)}
        </div>
      </div>`
      )
      .join("");
    el.querySelectorAll(".dc-card[data-recent-project]").forEach((card) => {
      card.addEventListener("click", () => openProject(card.dataset.recentProject, card.dataset.recentDoc));
    });
  } catch (e) {
    el.innerHTML = `<p class="empty-hint">${escapeHtml(e.message)}</p>`;
  }
}

async function loadProjects() {
  const el = $("project-list");
  try {
    const qs = favoriteOnly ? "?favoriteOnly=true" : "";
    const data = await api(`/projects${qs}`);
    const projects = data.projects ?? [];
    if (!projects.length) {
      el.innerHTML = '<p class="empty-hint">案件がありません</p>';
      return;
    }
    el.innerHTML = projects
      .map((p) => {
        const counts = Object.entries(p.folderCounts || {})
          .map(([k, v]) => `${(typeMeta[k]?.label || k)}${v}`)
          .slice(0, 4)
          .join(" · ");
        return `<div class="dc-card" data-project-id="${escapeHtml(p.projectId)}">
          <div class="dc-card-head">
            <div style="flex:1">
              <p class="dc-card-title">${escapeHtml(p.customerName)}<span style="font-weight:500;color:#64748b"> 様</span></p>
              <p class="dc-card-meta">${escapeHtml(p.projectNo)} · ${escapeHtml(p.siteName)} · 書類 ${p.documentCount}件</p>
              ${counts ? `<p class="dc-card-meta">${escapeHtml(counts)}</p>` : ""}
            </div>
            <button type="button" class="dc-star" data-fav="${escapeHtml(p.projectId)}" aria-label="お気に入り">${p.favorite ? "⭐" : "☆"}</button>
          </div>
        </div>`;
      })
      .join("");

    el.querySelectorAll(".dc-card[data-project-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-fav]")) return;
        openProject(card.dataset.projectId);
      });
    });
    el.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const result = await api(`/favorites/${btn.dataset.fav}/toggle`, { method: "POST", body: "{}" });
          btn.textContent = result.favorite ? "⭐" : "☆";
          toast(result.favorite ? "お気に入りに追加" : "お気に入り解除");
          if (favoriteOnly && !result.favorite) loadProjects();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<p class="empty-hint">${escapeHtml(e.message)}</p>`;
  }
}

function workflowSelectHtml(item) {
  if (!item.storageDocumentId) return "";
  const opts = WORKFLOW_OPTIONS[item.documentType] || WORKFLOW_OPTIONS.default;
  const current = item.workflowStatus || "draft";
  const options = opts
    .map((v) => `<option value="${v}"${v === current ? " selected" : ""}>${v}</option>`)
    .join("");
  return `<select data-workflow-id="${escapeHtml(item.storageDocumentId)}" aria-label="ステータス">${options}</select>`;
}

async function openProject(projectId, openDocId = "") {
  showProject(projectId);
  const header = $("project-header");
  const foldersEl = $("folder-list");
  const timelineEl = $("timeline-list");
  const qnapBar = $("qnap-bar");
  header.innerHTML = '<p class="empty-hint">読み込み中…</p>';
  foldersEl.innerHTML = "";
  timelineEl.innerHTML = "";
  try {
    const detail = await api(`/projects/${encodeURIComponent(projectId)}`);
    header.innerHTML = `<p class="section-label">${escapeHtml(detail.customerName)} 様</p>
      <p class="section-hint">${escapeHtml(detail.projectNo)} · ${escapeHtml(detail.siteName)} · 書類 ${detail.totalDocuments}件</p>
      <button type="button" class="dc-star" id="detail-fav">${detail.favorite ? "⭐ お気に入り" : "☆ お気に入り"}</button>`;
    $("detail-fav")?.addEventListener("click", async () => {
      const result = await api(`/favorites/${projectId}/toggle`, { method: "POST", body: "{}" });
      $("detail-fav").textContent = result.favorite ? "⭐ お気に入り" : "☆ お気に入り";
      toast(result.favorite ? "お気に入りに追加" : "お気に入り解除");
    });

    if (detail.qnapConfigured) {
      qnapBar.classList.remove("hidden");
      qnapBar.innerHTML = `<strong>QNAP連携</strong> — 設定済み
        <div class="dc-qnap-actions">
          <button type="button" id="btn-qnap-status">状態確認</button>
          <button type="button" id="btn-qnap-sync-pending">🟠 未保存だけ同期</button>
          <button type="button" id="btn-qnap-sync-failed">🔴 失敗だけ再同期</button>
          <button type="button" id="btn-qnap-sync-all">全部同期</button>
        </div>
        <div id="qnap-status-text" class="dc-card-meta" style="margin-top:0.35rem;"></div>`;
      $("btn-qnap-status")?.addEventListener("click", refreshQnapStatus);
      $("btn-qnap-sync-pending")?.addEventListener("click", () => syncQnap("pending"));
      $("btn-qnap-sync-failed")?.addEventListener("click", () => syncQnap("failed"));
      $("btn-qnap-sync-all")?.addEventListener("click", () => syncQnap("all"));
    } else {
      qnapBar.classList.add("hidden");
    }

    foldersEl.innerHTML = (detail.folders ?? [])
      .map((folder, idx) => {
        const rows = (folder.items ?? [])
          .map(
            (item) => `<div class="dc-doc-row" data-doc-id="${escapeHtml(item.id)}" data-doc-type="${escapeHtml(item.documentType)}">
              <div class="dc-doc-title">${escapeHtml(item.title)}</div>
              <div class="dc-doc-meta">${escapeHtml(item.fileName)}
                ${item.sourceType ? ` · ${sourceBadge(item.sourceType)}` : ""}
                ${item.qnapStatusLabel ? ` · ${item.qnapStatusIcon || ""} ${escapeHtml(item.qnapStatusLabel)}` : ""}
                ${item.workflowStatusLabel ? ` · ${escapeHtml(item.workflowStatusLabel)}` : ""}
              </div>
              <div class="dc-doc-actions">
                <button type="button" data-action="preview">プレビュー</button>
                ${item.storageDocumentId ? workflowSelectHtml(item) : ""}
                ${item.storageDocumentId ? `<button type="button" data-action="qnap-sync" data-storage-id="${escapeHtml(item.storageDocumentId)}">QNAP保存</button>` : ""}
              </div>
            </div>`
          )
          .join("");
        return `<div class="dc-folder" data-folder-idx="${idx}">
          <div class="dc-folder-head" style="border-left:4px solid ${folder.color}">
            <span>${folder.icon} ${escapeHtml(folder.label)}</span>
            <span class="count">${folder.count}件</span>
          </div>
          <div class="dc-folder-body${idx === 0 ? "" : " hidden"}">${rows || '<p class="empty-hint">空</p>'}</div>
        </div>`;
      })
      .join("");

    foldersEl.querySelectorAll(".dc-folder-head").forEach((head) => {
      head.addEventListener("click", () => head.nextElementSibling?.classList.toggle("hidden"));
    });

    foldersEl.querySelectorAll(".dc-doc-row").forEach((row) => {
      row.querySelector('[data-action="preview"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        previewDocument(projectId, row.dataset.docId, row.dataset.docType);
      });
      row.querySelector('[data-action="qnap-sync"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await api(`/qnap/sync/${e.target.dataset.storageId}`, { method: "POST", body: "{}" });
          toast("QNAP保存完了");
          openProject(projectId);
        } catch (err) {
          toast(err.message);
        }
      });
      row.querySelector("[data-workflow-id]")?.addEventListener("change", async (e) => {
        const id = e.target.dataset.workflowId;
        try {
          await api(`/storage/${id}/workflow-status`, {
            method: "PATCH",
            body: JSON.stringify({ workflowStatus: e.target.value }),
          });
          toast("ステータス更新");
        } catch (err) {
          toast(err.message);
        }
      });
    });

    timelineEl.innerHTML = (detail.timeline ?? [])
      .slice(0, 20)
      .map(
        (e) => `<div class="dc-tl-row">
          <span class="dc-tl-date">${escapeHtml(e.dateLabel)}</span>
          <div><div class="dc-tl-title">${escapeHtml(e.title)}</div>${e.description ? `<div class="dc-card-meta">${escapeHtml(e.description)}</div>` : ""}</div>
        </div>`
      )
      .join("") || '<p class="empty-hint">まだ履歴がありません</p>';

    if (openDocId) {
      const row = foldersEl.querySelector(`[data-doc-id="${CSS.escape(openDocId)}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch (e) {
    header.innerHTML = `<p class="empty-hint">${escapeHtml(e.message)}</p>`;
  }
}

async function refreshQnapStatus() {
  if (!currentProjectId) return;
  const el = $("qnap-status-text");
  try {
    const status = await api(`/projects/${encodeURIComponent(currentProjectId)}/qnap/status`);
    const s = status.summary || {};
    el.textContent = `🟢 同期済 ${s.synced ?? 0} / 🟠 未保存 ${s.pending ?? 0} / 🔴 失敗 ${s.failed ?? 0} / ⚙️ 同期中 ${s.syncing ?? 0}`;
  } catch (e) {
    el.textContent = e.message;
  }
}

async function syncQnap(mode) {
  if (!currentProjectId) return;
  const paths = { pending: "sync-pending", failed: "sync-failed", all: "sync-all" };
  try {
    await api(`/projects/${encodeURIComponent(currentProjectId)}/qnap/${paths[mode]}`, {
      method: "POST",
      body: "{}",
    });
    toast(mode === "failed" ? "失敗分を再同期しました" : "QNAP同期を開始しました");
    await refreshQnapStatus();
    openProject(currentProjectId);
  } catch (e) {
    toast(e.message);
  }
}

async function previewDocument(projectId, documentId, documentType) {
  const overlay = $("preview-overlay");
  const body = $("preview-body");
  const title = $("preview-title");
  const dlBtn = $("preview-download");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  body.innerHTML = '<p class="empty-hint" style="color:#fff">読み込み中…</p>';
  dlBtn?.classList.add("hidden");
  previewDownloadUrl = "";
  imageZoomed = false;
  try {
    const data = await api(
      `/projects/${encodeURIComponent(projectId)}/preview/${encodeURIComponent(documentId)}`
    );
    const item = data.item;
    title.textContent = item.title || item.fileName;
    await api("/recent", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        documentId,
        documentType: item.documentType || documentType,
        title: item.title,
        fileName: item.fileName,
        previewUrl: item.previewUrl,
      }),
    });

    if (item.previewKind === "pdf" && item.previewUrl) {
      previewDownloadUrl = item.previewUrl;
      dlBtn?.classList.remove("hidden");
      body.innerHTML = `<iframe src="${escapeHtml(item.previewUrl)}" title="PDF preview"></iframe>`;
    } else if (item.previewKind === "image" && item.previewUrl) {
      previewDownloadUrl = item.previewUrl;
      dlBtn?.classList.remove("hidden");
      const sizeKb = item.size ? `${Math.round(item.size / 1024)} KB` : "—";
      body.innerHTML = `<img id="preview-img" src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.title)}" />
        <div class="dc-preview-info">${escapeHtml(item.fileName)} · ${escapeHtml(item.mimeType || "image")} · ${sizeKb}</div>`;
      $("preview-img")?.addEventListener("click", () => {
        imageZoomed = !imageZoomed;
        $("preview-img")?.classList.toggle("zoomed", imageZoomed);
      });
    } else if (item.previewKind === "json") {
      const sum = data.drawingSummary;
      const summaryHtml = sum
        ? `<div class="dc-drawing-summary">
            <h3>${escapeHtml(sum.title || item.title || "図面")}</h3>
            <div class="dc-drawing-stats">
              <div class="dc-drawing-stat"><strong>${sum.layerCount}</strong>レイヤー</div>
              <div class="dc-drawing-stat"><strong>${sum.symbolCount}</strong>記号</div>
              <div class="dc-drawing-stat"><strong>${sum.wireCount}</strong>配線</div>
            </div>
          </div>`
        : "";
      body.innerHTML = `${summaryHtml}<pre class="dc-preview-json">${escapeHtml(JSON.stringify(data.jsonContent ?? {}, null, 2))}</pre>`;
    } else if (item.previewUrl || item.viewerUrl) {
      const url = item.previewUrl || item.viewerUrl;
      previewDownloadUrl = url;
      dlBtn?.classList.remove("hidden");
      body.innerHTML = `<iframe src="${escapeHtml(url)}" title="preview"></iframe>`;
    } else {
      body.innerHTML = `<p class="empty-hint" style="color:#fff">プレビュー非対応</p>
        ${item.viewerUrl ? `<a href="${escapeHtml(item.viewerUrl)}" style="color:#93c5fd">別タブで開く</a>` : ""}`;
    }
  } catch (e) {
    body.innerHTML = `<p class="empty-hint" style="color:#fff">${escapeHtml(e.message)}</p>`;
  }
}

function closePreview() {
  $("preview-overlay").classList.add("hidden");
  $("preview-overlay").setAttribute("aria-hidden", "true");
  $("preview-body").innerHTML = "";
  previewDownloadUrl = "";
}

function openUploadSheet() {
  if (!currentProjectId) {
    toast("案件を開いてからアップロードしてください");
    return;
  }
  $("upload-overlay")?.classList.remove("hidden");
  $("upload-overlay")?.setAttribute("aria-hidden", "false");
}

function closeUploadSheet() {
  $("upload-overlay")?.classList.add("hidden");
  $("upload-overlay")?.setAttribute("aria-hidden", "true");
  $("upload-file").value = "";
  $("upload-title").value = "";
  $("upload-memo").value = "";
}

async function submitUpload() {
  const fileInput = $("upload-file");
  const file = fileInput?.files?.[0];
  if (!file) {
    toast("ファイルを選択してください");
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const base64 = String(reader.result);
      let sourceType = $("upload-source")?.value || "manual";
      if (file.type === "application/pdf") sourceType = "pdf";
      else if (file.type.startsWith("image/")) sourceType = "photo";
      else if (file.name.endsWith(".json")) sourceType = "drawing";

      await api("/upload", {
        method: "POST",
        body: JSON.stringify({
          projectId: currentProjectId,
          documentType: $("upload-doctype")?.value || "other",
          sourceType,
          title: $("upload-title")?.value?.trim() || file.name,
          fileName: file.name,
          fileBase64: base64,
          mimeType: file.type,
          memo: $("upload-memo")?.value?.trim() || null,
        }),
      });
      toast("書類を保存しました");
      closeUploadSheet();
      openProject(currentProjectId);
    } catch (e) {
      toast(e.message);
    }
  };
  reader.readAsDataURL(file);
}

async function runSearch(q) {
  const el = $("search-results");
  const hasFilter = filterCategory !== "all" || filterQnap !== "all" || filterSource !== "all";
  if (!q.trim() && !hasFilter) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  try {
    const params = new URLSearchParams({
      q,
      limit: "30",
      documentType: filterCategory,
      qnapStatus: filterQnap,
      sourceType: filterSource,
      sort: searchSort,
    });
    const data = await api(`/search?${params}`);
    const hits = data.hits ?? [];
    el.classList.remove("hidden");
    if (!hits.length) {
      el.innerHTML = '<p class="empty-hint">該当なし</p>';
      return;
    }
    el.innerHTML = `<p class="section-hint">${hits.length}件（${data.elapsedMs}ms）</p>` + hits
      .map(
        (h) => `<div class="dc-card" data-search-project="${escapeHtml(h.projectId)}" data-search-doc="${escapeHtml(h.documentId)}">
          <div class="dc-card-head">
            <div>
              <p class="dc-card-title">${escapeHtml(h.title)}</p>
              <p class="dc-card-meta">${escapeHtml(h.projectNo)} · ${escapeHtml(h.customerName)} · ${escapeHtml(h.matchedField)}
                ${h.qnapStatusIcon ? ` · ${h.qnapStatusIcon}${escapeHtml(h.qnapStatusLabel || "")}` : ""}
              </p>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.2rem;align-items:flex-end">
              ${typeBadge(h.documentType)}
              ${sourceBadge(h.sourceType)}
            </div>
          </div>
        </div>`
      )
      .join("");
    el.querySelectorAll("[data-search-project]").forEach((card) => {
      card.addEventListener("click", () =>
        openProject(card.dataset.searchProject, card.dataset.searchDoc)
      );
    });
  } catch (e) {
    el.classList.remove("hidden");
    el.innerHTML = `<p class="empty-hint">${escapeHtml(e.message)}</p>`;
  }
}

async function init() {
  if (!(await requireCustomerLogin())) return;
  initPracticalNav({ active: "project_mgmt_v1" });
  await loadMeta();
  await loadRecent();
  await loadProjects();

  const params = new URLSearchParams(window.location.search);
  const pid = params.get("projectId");
  if (pid) await openProject(pid);

  $("tab-all")?.addEventListener("click", () => {
    favoriteOnly = false;
    $("tab-all").classList.add("active");
    $("tab-favorites").classList.remove("active");
    loadProjects();
  });
  $("tab-favorites")?.addEventListener("click", () => {
    favoriteOnly = true;
    $("tab-favorites").classList.add("active");
    $("tab-all").classList.remove("active");
    loadProjects();
  });
  $("btn-back")?.addEventListener("click", () => {
    showHome();
    loadRecent();
    loadProjects();
  });
  $("preview-close")?.addEventListener("click", closePreview);
  $("preview-download")?.addEventListener("click", () => {
    if (previewDownloadUrl) window.open(previewDownloadUrl, "_blank");
  });
  $("search-input")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 280);
  });
  $("sort-recent")?.addEventListener("click", () => {
    searchSort = "recent";
    $("sort-recent").classList.add("active");
    $("sort-created").classList.remove("active");
    runSearch($("search-input")?.value ?? "");
  });
  $("sort-created")?.addEventListener("click", () => {
    searchSort = "created";
    $("sort-created").classList.add("active");
    $("sort-recent").classList.remove("active");
    runSearch($("search-input")?.value ?? "");
  });
  $("btn-fab-upload")?.addEventListener("click", openUploadSheet);
  $("upload-cancel")?.addEventListener("click", closeUploadSheet);
  $("upload-submit")?.addEventListener("click", submitUpload);
  $("upload-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("upload-overlay")) closeUploadSheet();
  });
}

init().catch((e) => toast(e.message));

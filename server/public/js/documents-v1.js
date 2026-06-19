import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/documents/v1";
let favoriteOnly = false;
let currentProjectId = "";
let searchTimer = null;
let typeMeta = {};

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

function showHome() {
  $("view-home").classList.remove("hidden");
  $("view-project").classList.add("hidden");
  currentProjectId = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("projectId");
  window.history.replaceState({}, "", url.pathname + url.search);
}

function showProject(projectId) {
  currentProjectId = projectId;
  $("view-home").classList.add("hidden");
  $("view-project").classList.remove("hidden");
  const url = new URL(window.location.href);
  url.searchParams.set("projectId", projectId);
  window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
}

async function loadMeta() {
  const data = await api("/meta");
  typeMeta = data.documentTypes || {};
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
          <button type="button" id="btn-qnap-sync-all">QNAPへ再同期</button>
        </div>
        <div id="qnap-status-text" class="dc-card-meta" style="margin-top:0.35rem;"></div>`;
      $("btn-qnap-status")?.addEventListener("click", refreshQnapStatus);
      $("btn-qnap-sync-all")?.addEventListener("click", syncAllQnap);
    } else {
      qnapBar.classList.add("hidden");
    }

    foldersEl.innerHTML = (detail.folders ?? [])
      .map((folder, idx) => {
        const rows = (folder.items ?? [])
          .map(
            (item) => `<div class="dc-doc-row" data-doc-id="${escapeHtml(item.id)}" data-doc-type="${escapeHtml(item.documentType)}">
              <div class="dc-doc-title">${escapeHtml(item.title)}</div>
              <div class="dc-doc-meta">${escapeHtml(item.fileName)}${item.qnapStatusLabel ? ` · ${item.qnapStatusIcon || ""} ${escapeHtml(item.qnapStatusLabel)}` : ""}</div>
              <div class="dc-doc-actions">
                <button type="button" data-action="preview">プレビュー</button>
                ${item.viewerUrl ? `<a href="${escapeHtml(item.viewerUrl)}" target="_blank" rel="noopener">開く</a>` : ""}
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
      head.addEventListener("click", () => {
        const body = head.nextElementSibling;
        body?.classList.toggle("hidden");
      });
    });

    foldersEl.querySelectorAll(".dc-doc-row").forEach((row) => {
      row.querySelector('[data-action="preview"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        previewDocument(projectId, row.dataset.docId, row.dataset.docType);
      });
      row.querySelector('[data-action="qnap-sync"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const storageId = e.target.dataset.storageId;
        try {
          await api(`/qnap/sync/${storageId}`, { method: "POST", body: "{}" });
          toast("QNAP保存完了");
          openProject(projectId);
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
    el.textContent = `同期済 ${s.synced ?? 0} / 未保存 ${s.pending ?? 0} / 失敗 ${s.failed ?? 0}`;
  } catch (e) {
    el.textContent = e.message;
  }
}

async function syncAllQnap() {
  if (!currentProjectId) return;
  try {
    await api(`/projects/${encodeURIComponent(currentProjectId)}/qnap/sync-all`, {
      method: "POST",
      body: "{}",
    });
    toast("QNAP再同期を開始しました");
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
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  body.innerHTML = '<p class="empty-hint" style="color:#fff">読み込み中…</p>';
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
      body.innerHTML = `<iframe src="${escapeHtml(item.previewUrl)}" title="PDF preview"></iframe>`;
    } else if (item.previewKind === "image" && item.previewUrl) {
      body.innerHTML = `<img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.title)}" />`;
    } else if (item.previewKind === "json") {
      body.innerHTML = `<pre class="dc-preview-json">${escapeHtml(JSON.stringify(data.jsonContent ?? {}, null, 2))}</pre>`;
    } else if (item.viewerUrl) {
      body.innerHTML = `<iframe src="${escapeHtml(item.viewerUrl)}" title="preview"></iframe>`;
    } else {
      body.innerHTML = '<p class="empty-hint" style="color:#fff">プレビュー非対応</p>';
    }
  } catch (e) {
    body.innerHTML = `<p class="empty-hint" style="color:#fff">${escapeHtml(e.message)}</p>`;
  }
}

function closePreview() {
  $("preview-overlay").classList.add("hidden");
  $("preview-overlay").setAttribute("aria-hidden", "true");
  $("preview-body").innerHTML = "";
}

async function runSearch(q) {
  const el = $("search-results");
  if (!q.trim()) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  try {
    const data = await api(`/search?q=${encodeURIComponent(q)}&limit=30`);
    const hits = data.hits ?? [];
    if (!hits.length) {
      el.classList.remove("hidden");
      el.innerHTML = '<p class="empty-hint">該当なし</p>';
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML = `<p class="section-hint">${hits.length}件（${data.elapsedMs}ms）</p>` + hits
      .map(
        (h) => `<div class="dc-card" data-search-project="${escapeHtml(h.projectId)}" data-search-doc="${escapeHtml(h.documentId)}">
          <div class="dc-card-head">
            <div>
              <p class="dc-card-title">${escapeHtml(h.title)}</p>
              <p class="dc-card-meta">${escapeHtml(h.projectNo)} · ${escapeHtml(h.customerName)} · ${escapeHtml(h.matchedField)}</p>
            </div>
            ${typeBadge(h.documentType)}
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
  $("search-input")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 280);
  });
}

init().catch((e) => toast(e.message));

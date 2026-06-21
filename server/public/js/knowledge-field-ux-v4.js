/** Knowledge Field UX V4 — キャッシュ / 見せるモード / 案件クイックアクセス */

export {
  MOTHERSHIP_UNC,
  MOTHERSHIP_HOST,
  STORAGE_V2_RECENT_SEARCH,
  STORAGE_V2_FAVORITES,
  STORAGE_V2_RECENT_KNOWLEDGE,
  STORAGE_V2_LAST_RESULTS,
  STORAGE_V2_USED_LOG,
  readJson,
  writeJson,
  escapeHtml,
  hitCapabilities,
  buildQnapLinksClient,
  resolveHitQnapPath,
  pushRecentSearchV2,
  saveLastSearchResultsV2,
  loadLastSearchResultsV2,
  toggleFavoriteKnowledgeV2,
  renderFlagRow,
  bindHitCardActions,
} from "./knowledge-field-ux-v2.js";

export {
  STORAGE_V3_RECENT_LIMIT,
  showQnapModalV3,
  renderAttachmentCardV3,
  bindAttachmentCardsV3,
  pushRecentKnowledgeV3,
  pushRecentSearchV3,
  logKnowledgeUsedV3,
  aggregateLocalUsageRankingV3,
  fetchUsageRankingV3,
  mergeUsageRankings,
  renderUsageRankingHtml,
  renderRecentKnowledgeHtml,
  buildHitActionButtonsV3,
  bindHitCardActionsV3,
} from "./knowledge-field-ux-v3.js";

import {
  readJson,
  writeJson,
  escapeHtml,
  STORAGE_V2_RECENT_KNOWLEDGE,
  STORAGE_V2_USED_LOG,
  resolveHitQnapPath,
} from "./knowledge-field-ux-v2.js";
import {
  renderAttachmentCardV3,
  buildHitActionButtonsV3,
} from "./knowledge-field-ux-v3.js";

export const STORAGE_V4_CACHE_ENABLED = "tisly_knowledge_v4_cache_enabled";
export const STORAGE_V4_CACHE_STATUS = "tisly_knowledge_v4_cache_status";
export const STORAGE_V4_PRESENTATION_MODE = "tisly_knowledge_v4_presentation_mode";
export const STORAGE_V4_PROJECT_FILTER = "tisly_knowledge_v4_project_filter";
export const STORAGE_V4_FAVORITE_KNOWLEDGE = "tisly_knowledge_v4_favorite_knowledge";
export const CACHE_NAME_V4 = "tisly-knowledge-files-v4";
export const CACHE_MAX_ITEMS = 20;

export function isCacheEnabledV4() {
  return readJson(STORAGE_V4_CACHE_ENABLED, true) !== false;
}

export function setCacheEnabledV4(enabled) {
  writeJson(STORAGE_V4_CACHE_ENABLED, Boolean(enabled));
}

export function isPresentationModeV4() {
  return readJson(STORAGE_V4_PRESENTATION_MODE, false) === true;
}

export function setPresentationModeV4(enabled) {
  writeJson(STORAGE_V4_PRESENTATION_MODE, Boolean(enabled));
  document.body.classList.toggle("knowledge-presentation-mode", Boolean(enabled));
}

export function getProjectFilterV4() {
  return readJson(STORAGE_V4_PROJECT_FILTER, null);
}

export function setProjectFilterV4(project) {
  if (!project) {
    localStorage.removeItem(STORAGE_V4_PROJECT_FILTER);
    return;
  }
  writeJson(STORAGE_V4_PROJECT_FILTER, project);
}

export function readCacheStatusMapV4() {
  return readJson(STORAGE_V4_CACHE_STATUS, {});
}

export function writeCacheStatusMapV4(map) {
  writeJson(STORAGE_V4_CACHE_STATUS, map);
}

export function getCacheStatusForItemV4(key) {
  const map = readCacheStatusMapV4();
  return map[key] ?? { status: "uncached" };
}

export function renderCacheStatusBadgeV4(itemKey) {
  if (!isCacheEnabledV4()) {
    return '<span class="cache-badge cache-off">キャッシュOFF</span>';
  }
  const st = getCacheStatusForItemV4(itemKey);
  if (st.status === "cached") {
    return '<span class="cache-badge cache-ok">キャッシュ済み</span>';
  }
  if (!navigator.onLine && st.status === "offline_view") {
    return '<span class="cache-badge cache-offline">オフライン表示</span>';
  }
  return '<span class="cache-badge cache-pending">未キャッシュ</span>';
}

function trimCacheMap(map) {
  const entries = Object.entries(map).sort(
    (a, b) => (b[1].cachedAt || "").localeCompare(a[1].cachedAt || "")
  );
  const trimmed = entries.slice(0, CACHE_MAX_ITEMS);
  return Object.fromEntries(trimmed);
}

/** 最近開いた Knowledge の PDF/写真 URL を Cache API へ（失敗しても通常表示は維持） */
export async function cacheRecentKnowledgeFilesV4(token) {
  if (!isCacheEnabledV4() || !("caches" in window)) return;
  const recent = readJson(STORAGE_V2_RECENT_KNOWLEDGE, []);
  const map = readCacheStatusMapV4();
  const cache = await caches.open(CACHE_NAME_V4);
  let cached = 0;

  for (const item of recent.slice(0, CACHE_MAX_ITEMS)) {
    const key = `${item.kind || "card"}:${item.id}`;
    const urls = item.cacheUrls || [];
    if (!urls.length) {
      map[key] = { status: "uncached", knowledgeId: item.id, title: item.title };
      continue;
    }
    let ok = false;
    for (const url of urls) {
      try {
        const req = new Request(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const res = await fetch(req);
        if (!res.ok) continue;
        await cache.put(url, res.clone());
        ok = true;
        cached += 1;
      } catch {
        /* キャッシュ失敗は無視 */
      }
    }
    map[key] = {
      status: ok ? "cached" : navigator.onLine ? "uncached" : "offline_view",
      knowledgeId: item.id,
      title: item.title,
      cachedAt: ok ? new Date().toISOString() : map[key]?.cachedAt,
      urls,
    };
  }

  writeCacheStatusMapV4(trimCacheMap(map));
  return cached;
}

export function enrichRecentKnowledgeWithCacheUrlsV4(items, detailCache = {}) {
  return items.map((item) => {
    const key = `${item.kind || "card"}:${item.id}`;
    const detail = detailCache[key];
    const urls = [];
    if (detail?.openUrl) urls.push(detail.openUrl);
    for (const att of [...(detail?.relatedPdfs || []), ...(detail?.relatedPhotos || [])]) {
      if (att.previewUrl) urls.push(att.previewUrl);
      else if (att.openUrl) urls.push(att.openUrl);
    }
    return { ...item, cacheUrls: [...new Set(urls)].slice(0, 3) };
  });
}

export function renderRecentKnowledgeHtmlV4(items) {
  if (!items?.length) {
    return '<p class="status-muted">まだありません</p>';
  }
  return `<div class="recent-knowledge-list v4-card-list">${items
    .map((item) => {
      const kind = item.kind ? `&kind=${encodeURIComponent(item.kind)}` : "";
      const href = `/knowledge-detail-v1?id=${encodeURIComponent(item.id)}${kind}`;
      const key = `${item.kind || "card"}:${item.id}`;
      return `<a class="recent-knowledge-item v4-summary-card" href="${href}">
        <span class="recent-knowledge-title">${escapeHtml(item.title)}</span>
        <small>${escapeHtml(item.category || item.kind || "—")}</small>
        ${renderCacheStatusBadgeV4(key)}
      </a>`;
    })
    .join("")}</div>`;
}

export async function fetchProjectQuickAccessV4(token, limit = 8) {
  try {
    const res = await fetch(`/api/knowledge/project-access-v1?limit=${limit}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.projects)) return data.projects;
  } catch {
    /* fallback mock below */
  }
  return [
    {
      projectId: "MO-26-0616-001",
      propertyName: "守谷市テスト現場",
      knowledgeCount: 4,
      lastUsedAt: "2026-06-20T10:00:00.000Z",
    },
  ];
}

export function renderProjectQuickAccessHtmlV4(projects, activeProjectId) {
  if (!projects?.length) {
    return '<p class="status-muted">案件データがありません</p>';
  }
  return `<div class="project-access-list v4-card-list">${projects
    .map((p) => {
      const active = p.projectId === activeProjectId ? " active" : "";
      const date = p.lastUsedAt ? p.lastUsedAt.slice(0, 10) : "—";
      return `<button type="button" class="project-access-card v4-summary-card${active}" data-project-id="${escapeHtml(p.projectId)}" data-project-name="${escapeHtml(p.propertyName)}">
        <strong>${escapeHtml(p.propertyName)}</strong>
        <small>${escapeHtml(p.projectId)} · 関連 ${p.knowledgeCount ?? 0}件 · 最終 ${escapeHtml(date)}</small>
      </button>`;
    })
    .join("")}</div>`;
}

export function renderProjectUsageLogsHtmlV4(entries) {
  if (!entries?.length) {
    return '<p class="status-muted">この案件の使用ログはまだありません</p>';
  }
  return `<div class="project-usage-log v4-card-list">${entries
    .slice(0, 10)
    .map(
      (e) => `<div class="project-usage-item v4-summary-card">
        <strong>${escapeHtml(e.title)}</strong>
        <small>${escapeHtml(e.usedAt?.slice(0, 16) || "—")}${e.query ? ` · ${escapeHtml(e.query)}` : ""}</small>
      </div>`
    )
    .join("")}</div>`;
}

export function filterHitsByProjectV4(hits, projectId) {
  if (!projectId) return hits;
  return hits.filter((h) => h.projectNo === projectId || (h.id && h.id.includes(projectId)));
}

export function renderAttachmentCardV4(att, options = {}) {
  const presentation = options.presentation ?? isPresentationModeV4();
  if (presentation) {
    const type = att.fileType || "other";
    let previewBlock = "";
    if (type === "pdf" && att.previewUrl) {
      previewBlock = `<div class="attach-inline-pdf presentation-pdf">
        <iframe src="${escapeHtml(att.previewUrl)}" title="${escapeHtml(att.label)}" loading="lazy"></iframe>
      </div>`;
    } else if (type === "photo" && (att.previewUrl || att.openUrl)) {
      const src = att.previewUrl || att.openUrl;
      previewBlock = `<img class="attach-inline-photo presentation-photo" src="${escapeHtml(src)}" alt="${escapeHtml(att.label)}" loading="lazy" />`;
    } else if (["stl", "step", "gcode"].includes(type)) {
      previewBlock = `<div class="attach-file-card attach-3d-card presentation-3d">
        <span class="attach-file-icon">${type === "stl" ? "🖨 3D部品" : type === "step" ? "📐 設計データ" : "⚙ 加工データ"}</span>
        <span class="attach-file-name">${escapeHtml(att.label)}</span>
      </div>`;
    }
    const openBtn = att.openUrl
      ? `<a class="attach-open-btn attach-open-btn-lg presentation-open" href="${escapeHtml(att.openUrl)}" target="_blank" rel="noopener">資料を見る</a>`
      : "";
    return `<div class="attach-card attach-card-v4 presentation-attach" data-type="${escapeHtml(type)}">
      ${previewBlock}
      <div class="attach-card-body">
        <strong>${escapeHtml(att.label)}</strong>
        <div class="attach-actions">${openBtn}</div>
      </div>
    </div>`;
  }

  let html = renderAttachmentCardV3(att);
  if (options.hideInternalPaths) {
    html = html
      .replace(/<code class="attach-path">[\s\S]*?<\/code>/g, "")
      .replace(/<span class="attach-mode-hint[^"]*">[\s\S]*?<\/span>/g, "")
      .replace(/QNAP\/File Station を利用/g, "資料を確認");
  }
  return html.replace('attach-card attach-card-v3', 'attach-card attach-card-v4');
}

export function buildHitActionButtonsV4(hit, flags, detailUrl, options = {}) {
  const presentation = options.presentation ?? isPresentationModeV4();
  if (presentation) {
    const actions = [];
    if (flags.pdf && hit.openUrl) {
      actions.push(`<a class="action-pdf-lg presentation-action" href="${escapeHtml(hit.openUrl)}" target="_blank" rel="noopener">📄 PDFを見る</a>`);
    }
    if (flags.photo && hit.openUrl) {
      actions.push(`<a class="action-photo-lg presentation-action" href="${escapeHtml(hit.openUrl)}">📷 写真を見る</a>`);
    }
    actions.push(`<a class="primary presentation-action" href="${detailUrl}">詳細を見る</a>`);
    actions.push(
      `<button type="button" class="used-btn full presentation-used" data-id="${escapeHtml(hit.id)}" data-kind="${escapeHtml(hit.kind)}" data-title="${escapeHtml(hit.title)}" data-category="${escapeHtml(hit.category || "")}">この資料を使う</button>`
    );
    return actions;
  }

  const actions = buildHitActionButtonsV3(hit, flags, detailUrl);
  if (options.hideInternalPaths) {
    return actions.filter((a) => !a.includes("qnap-link-btn") && !a.includes("QNAP場所"));
  }
  return actions;
}

export function toggleFavoriteKnowledgeV4(item) {
  if (!item?.id) return false;
  const key = `${item.kind || "card"}:${item.id}`;
  let favs = readJson(STORAGE_V4_FAVORITE_KNOWLEDGE, []);
  const exists = favs.some((f) => `${f.kind || "card"}:${f.id}` === key);
  if (exists) {
    favs = favs.filter((f) => `${f.kind || "card"}:${f.id}` !== key);
    writeJson(STORAGE_V4_FAVORITE_KNOWLEDGE, favs);
    return false;
  }
  favs = [{ id: item.id, kind: item.kind, title: item.title, category: item.category }, ...favs].slice(0, 30);
  writeJson(STORAGE_V4_FAVORITE_KNOWLEDGE, favs);
  return true;
}

export function isFavoriteKnowledgeV4(item) {
  const key = `${item?.kind || "card"}:${item?.id}`;
  return readJson(STORAGE_V4_FAVORITE_KNOWLEDGE, []).some(
    (f) => `${f.kind || "card"}:${f.id}` === key
  );
}

export function filterLocalUsageByProjectV4(projectId, limit = 20) {
  if (!projectId) return [];
  return readJson(STORAGE_V2_USED_LOG, [])
    .filter((e) => e.projectId === projectId)
    .slice(0, limit);
}

export async function fetchProjectUsageLogsV4(projectId, token) {
  try {
    const res = await fetch(
      `/api/knowledge/project-access-v1/${encodeURIComponent(projectId)}/logs?limit=20`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.entries)) return data.entries;
  } catch {
    /* local fallback */
  }
  return filterLocalUsageByProjectV4(projectId);
}

export function pushRecentKnowledgeV4(item, cacheUrls = []) {
  if (!item?.id) return;
  let recent = readJson(STORAGE_V2_RECENT_KNOWLEDGE, []);
  recent = [
    { ...item, cacheUrls, openedAt: new Date().toISOString() },
    ...recent.filter((x) => x.id !== item.id || x.kind !== item.kind),
  ].slice(0, CACHE_MAX_ITEMS);
  writeJson(STORAGE_V2_RECENT_KNOWLEDGE, recent);
}

export function renderFieldToolbarV4() {
  const cacheOn = isCacheEnabledV4();
  const presOn = isPresentationModeV4();
  return `<div class="field-v4-toolbar friendly-card">
    <button type="button" class="field-mode-btn${presOn ? " active" : ""}" id="presentation-mode-btn" aria-pressed="${presOn}">
      ${presOn ? "👁 見せるモード ON" : "👁 見せるモード"}
    </button>
    <button type="button" class="field-mode-btn${cacheOn ? " active" : ""}" id="cache-toggle-btn" aria-pressed="${cacheOn}">
      ${cacheOn ? "📦 キャッシュ ON" : "📦 キャッシュ OFF"}
    </button>
    <a class="field-mode-btn dashboard-link" href="/knowledge-usage-dashboard-v1">📊 使用ログ</a>
  </div>`;
}

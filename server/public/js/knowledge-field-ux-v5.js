/** Knowledge Field UX V5 — Service Worker 統合 / オフライン / 見せるモード強化 */

export {
  isCacheEnabledV4 as isCacheEnabledV5,
  setCacheEnabledV4 as setCacheEnabledV5,
  isPresentationModeV4 as isPresentationModeV5,
  setPresentationModeV4 as setPresentationModeV5,
  readCacheStatusMapV4 as readCacheStatusMapV5,
  writeCacheStatusMapV4 as writeCacheStatusMapV5,
  cacheRecentKnowledgeFilesV4 as cacheRecentKnowledgeFilesV5,
  CACHE_NAME_V4 as CACHE_NAME_V5,
  CACHE_MAX_ITEMS,
} from "./knowledge-field-ux-v4.js";

import {
  readJson,
  writeJson,
  escapeHtml,
  STORAGE_V2_RECENT_KNOWLEDGE,
} from "./knowledge-field-ux-v2.js";
import {
  isCacheEnabledV4,
  setCacheEnabledV4,
  readCacheStatusMapV4,
  writeCacheStatusMapV4,
  cacheRecentKnowledgeFilesV4,
  CACHE_NAME_V4,
  isPresentationModeV4,
  renderCacheStatusBadgeV4,
} from "./knowledge-field-ux-v4.js";

export const STORAGE_V5_OFFLINE_MODE = "tisly_knowledge_v5_offline_mode";
export const SW_KNOWLEDGE_SCOPE = "/sw-knowledge-field-v5.js";
export const KNOWLEDGE_SW_CACHE = "tisly-knowledge-field-v5";

const INTERNAL_URL_RE =
  /(?:QNAP|SMB|WebDAV|192\.168\.|\\\\|filemanager|\/api\/|projectId|userId|mock fallback|placeholder)/i;

export function containsInternalInfoV5(text) {
  if (!text) return false;
  return INTERNAL_URL_RE.test(String(text));
}

export function sanitizePresentationTextV5(text) {
  if (!text) return "";
  return String(text)
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\\\\[^\s]+/gi, "")
    .replace(/\/api\/[^\s]+/gi, "")
    .replace(/QNAP[^\s]*/gi, "")
    .replace(/WebDAV[^\s]*/gi, "")
    .replace(/SMB[^\s]*/gi, "")
    .replace(/projectId[=:]\S+/gi, "")
    .replace(/userId[=:]\S+/gi, "")
    .trim();
}

export function isOfflineFieldModeV5() {
  return readJson(STORAGE_V5_OFFLINE_MODE, false) === true;
}

export function setOfflineFieldModeV5(enabled) {
  writeJson(STORAGE_V5_OFFLINE_MODE, Boolean(enabled));
  document.body.classList.toggle("knowledge-offline-mode", Boolean(enabled));
}

export function registerKnowledgeServiceWorkerV5() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker
    .register(SW_KNOWLEDGE_SCOPE, { scope: "/" })
    .then((reg) => {
      syncKnowledgeCacheToSwV5();
      return reg;
    })
    .catch(() => null);
}

export function syncKnowledgeCacheToSwV5() {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "KNOWLEDGE_CACHE_V5",
    enabled: isCacheEnabledV4(),
  });
}

export async function clearKnowledgeCachesV5() {
  if ("caches" in window) {
    await caches.delete(CACHE_NAME_V4).catch(() => {});
    await caches.delete(KNOWLEDGE_SW_CACHE).catch(() => {});
  }
  writeCacheStatusMapV4({});
}

export async function refreshAllKnowledgeCacheV5(token) {
  await cacheRecentKnowledgeFilesV4(token);
  syncKnowledgeCacheToSwV5();
  const recent = readJson(STORAGE_V2_RECENT_KNOWLEDGE, []);
  const map = readCacheStatusMapV4();
  for (const item of recent.slice(0, 20)) {
    const key = `${item.kind || "card"}:${item.id}`;
    for (const url of item.cacheUrls || []) {
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          map[key] = {
            status: "cached",
            knowledgeId: item.id,
            title: item.title,
            cachedAt: new Date().toISOString(),
            urls: item.cacheUrls,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }
  writeCacheStatusMapV4(map);
}

export async function estimateCacheSizeV5() {
  if (!("caches" in window)) return { entries: 0, bytes: 0, label: "—" };
  let entries = 0;
  let bytes = 0;
  for (const name of [CACHE_NAME_V4, KNOWLEDGE_SW_CACHE]) {
    try {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      entries += keys.length;
      for (const req of keys) {
        const res = await cache.match(req);
        if (res) {
          const blob = await res.clone().blob();
          bytes += blob.size;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const kb = Math.round(bytes / 1024);
  return {
    entries,
    bytes,
    label: kb > 1024 ? `約 ${(kb / 1024).toFixed(1)} MB` : `約 ${kb} KB`,
  };
}

export function getLastCacheTimestampV5() {
  const map = readCacheStatusMapV4();
  const times = Object.values(map)
    .map((v) => v.cachedAt)
    .filter(Boolean)
    .sort();
  return times.length ? times[times.length - 1] : null;
}

export function listCachedKnowledgeItemsV5() {
  const map = readCacheStatusMapV4();
  const recent = readJson(STORAGE_V2_RECENT_KNOWLEDGE, []);
  return recent
    .map((item) => {
      const key = `${item.kind || "card"}:${item.id}`;
      const st = map[key];
      return {
        ...item,
        cacheStatus: st?.status || "uncached",
        cachedAt: st?.cachedAt,
      };
    })
    .filter((item) => item.cacheStatus === "cached" || item.cacheStatus === "offline_view");
}

export function renderOfflineFieldModePanelV5(options = {}) {
  const offlineOn = options.offlineMode ?? isOfflineFieldModeV5();
  const cachedItems = listCachedKnowledgeItemsV5();
  const lastAt = getLastCacheTimestampV5();
  const sizeLabel = options.sizeLabel ?? "計算中…";

  return `<div class="offline-field-panel friendly-card" id="offline-field-panel">
    <div class="offline-field-header">
      <h2>📶 現場オフラインモード</h2>
      <button type="button" class="field-mode-btn${offlineOn ? " active" : ""}" id="offline-mode-toggle">
        ${offlineOn ? "オフライン表示中" : "オフライン表示"}
      </button>
    </div>
    <p class="offline-field-meta">
      キャッシュ済み ${cachedItems.length}件 · 最終更新 ${escapeHtml(lastAt ? lastAt.slice(0, 16).replace("T", " ") : "—")} · 容量目安 ${escapeHtml(sizeLabel)}
    </p>
    <div class="offline-field-actions">
      <button type="button" class="friendly-btn" id="refresh-cache-btn">全キャッシュ更新</button>
      <button type="button" class="friendly-btn" id="clear-cache-btn">キャッシュ削除</button>
    </div>
    <div class="offline-cached-list v5-card-list">${renderCachedItemsHtmlV5(cachedItems, offlineOn)}</div>
  </div>`;
}

function renderCachedItemsHtmlV5(items, offlineOnly) {
  const list = offlineOnly ? items : items.length ? items : readJson(STORAGE_V2_RECENT_KNOWLEDGE, []).slice(0, 10);
  if (!list.length) {
    return '<p class="status-muted">キャッシュ済み資料がありません。資料を開くと自動キャッシュされます。</p>';
  }
  return list
    .map((item) => {
      const kind = item.kind ? `&kind=${encodeURIComponent(item.kind)}` : "";
      const href = `/knowledge-detail-v1?id=${encodeURIComponent(item.id)}${kind}`;
      const key = `${item.kind || "card"}:${item.id}`;
      return `<a class="offline-cached-item v5-summary-card" href="${href}">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.category || item.kind || "—")}</small>
        ${renderCacheStatusBadgeV4(key)}
      </a>`;
    })
    .join("");
}

export function renderCustomerExplanationCardV5(explanation, presentation = false) {
  if (!explanation) return "";
  const rows = [
    ["これは何の資料か", explanation.whatIsIt],
    ["どこに使うか", explanation.whereUsed],
    ["工事で何が良くなるか", explanation.benefit],
    ["注意点", explanation.cautions],
    ["施工後にお客様が見るポイント", explanation.afterInstallPoints],
  ];
  const body = rows
    .map(
      ([label, text]) =>
        `<div class="customer-explain-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(sanitizePresentationTextV5(text))}</dd></div>`
    )
    .join("");
  const sourceHint = presentation
    ? ""
    : `<p class="customer-explain-source">生成: ${escapeHtml(explanation.source)}</p>`;
  return `<section class="customer-explanation-card friendly-card${presentation ? " presentation-card" : ""}" id="customer-explanation">
    <h2>💬 お客様向け説明</h2>
    <dl class="customer-explain-list">${body}</dl>
    ${sourceHint}
  </section>`;
}

export async function fetchProjectKnowledgeV5(projectId, token) {
  try {
    const res = await fetch(
      `/api/knowledge/project-access-v1/${encodeURIComponent(projectId)}/knowledge?limit=30`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.items)) return data.items;
  } catch {
    /* fallback empty */
  }
  return [];
}

export function renderProjectKnowledgePanelV5(project, items) {
  if (!project?.projectId) return "";
  const presentation = isPresentationModeV4();
  const title = presentation ? sanitizePresentationTextV5(project.propertyName) : project.propertyName;
  const list = items?.length
    ? items
        .map((item) => {
          const badges = [
            item.hasPdf ? '<span class="flag-badge on">PDF</span>' : "",
            item.hasPhoto ? '<span class="flag-badge on">写真</span>' : "",
          ].join("");
          return `<a class="project-knowledge-item v5-summary-card" href="${escapeHtml(item.detailUrl)}">
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.category)} · 使用 ${item.usageCount ?? 0}回</small>
            <span class="flag-row">${badges}</span>
          </a>`;
        })
        .join("")
    : '<p class="status-muted">関連ナレッジがありません</p>';

  return `<div class="project-knowledge-panel friendly-card" id="project-knowledge-panel">
    <h2>📂 この案件の関連資料</h2>
    <p class="project-knowledge-meta">${escapeHtml(title)}</p>
    <div class="project-knowledge-list v5-card-list">${list}</div>
    <button type="button" class="friendly-btn primary full project-used-btn" data-project-id="${escapeHtml(project.projectId)}">
      この案件で使った
    </button>
  </div>`;
}

export function bindOfflineFieldPanelV5(root, handlers = {}) {
  $("offline-mode-toggle")?.addEventListener("click", () => {
    const next = !isOfflineFieldModeV5();
    setOfflineFieldModeV5(next);
    handlers.onOfflineToggle?.(next);
  });
  $("refresh-cache-btn")?.addEventListener("click", () => handlers.onRefreshCache?.());
  $("clear-cache-btn")?.addEventListener("click", () => handlers.onClearCache?.());

  window.addEventListener("online", () => {
    if (isOfflineFieldModeV5() && navigator.onLine) {
      setOfflineFieldModeV5(false);
      handlers.onOnlineRestore?.();
    }
  });
}

function $(id) {
  return document.getElementById(id);
}

export function renderFieldToolbarV5() {
  const cacheOn = isCacheEnabledV4();
  const presOn = isPresentationModeV4();
  const offlineOn = isOfflineFieldModeV5();
  return `<div class="field-v5-toolbar friendly-card">
    <button type="button" class="field-mode-btn${presOn ? " active" : ""}" id="presentation-mode-btn" aria-pressed="${presOn}">
      ${presOn ? "👁 見せるモード ON" : "👁 見せるモード"}
    </button>
    <button type="button" class="field-mode-btn${cacheOn ? " active" : ""}" id="cache-toggle-btn" aria-pressed="${cacheOn}">
      ${cacheOn ? "📦 キャッシュ ON" : "📦 キャッシュ OFF"}
    </button>
    <button type="button" class="field-mode-btn${offlineOn ? " active" : ""}" id="offline-mode-quick-btn">
      ${offlineOn ? "📶 オフライン" : "📶 オフライン"}
    </button>
    <a class="field-mode-btn dashboard-link" href="/knowledge-usage-dashboard-v1">📊 使用ログ</a>
  </div>`;
}

export function stripInternalFromHitV5(hit, presentation) {
  if (!presentation) return hit;
  return {
    ...hit,
    projectNo: undefined,
    qnapPath: undefined,
    openUrl: hit.openUrl && !containsInternalInfoV5(hit.openUrl) ? hit.openUrl : hit.openUrl,
  };
}

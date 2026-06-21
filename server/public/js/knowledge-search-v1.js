import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  bindHitCardActions,
  buildHitActionButtons,
  hitCapabilities,
  logKnowledgeUsedV2,
  pushRecentSearchV2,
  renderFlagRow,
  saveLastSearchResultsV2,
} from "./knowledge-field-ux-v2.js";

const STORAGE_HISTORY = "tisly_knowledge_search_history_v1";
const STORAGE_FAVORITES = "tisly_knowledge_search_favorites_v1";
const STORAGE_RECENT = "tisly_knowledge_search_recent_v1";
const DEFAULT_FAVORITES = ["5.5kW", "厨房機器", "PoEカメラ", "自己保持", "VVF2.0"];

const KIND_LABELS = {
  knowledge_card: "カード",
  candidate: "候補",
  project: "案件",
  pdf: "PDF",
  photo: "写真",
  asset: "資産",
  plc: "PLC",
  esp: "ESP/RP",
  "3dprint": "3DPrint",
  factory: "Factory",
};

const $ = (id) => document.getElementById(id);
let viewMode = "list";
let selectedKinds = new Set();
let lastHits = [];
let lastQuery = "";

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMobileMode() {
  const params = new URLSearchParams(location.search);
  if (params.get("mobile") === "1") return true;
  return window.matchMedia("(max-width: 767px)").matches;
}

async function apiSearch(params) {
  const token = getCustomerToken();
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api/knowledge/search-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function pushRecentQuery(q) {
  const trimmed = q.trim();
  if (!trimmed) return;
  let recent = readJson(STORAGE_RECENT, []);
  recent = [trimmed, ...recent.filter((x) => x !== trimmed)].slice(0, 10);
  writeJson(STORAGE_RECENT, recent);
  pushRecentSearchV2(trimmed);
  renderRecentChips();
}

function pushHistory(entry) {
  let history = readJson(STORAGE_HISTORY, []);
  history.unshift({ ...entry, at: new Date().toISOString() });
  history = history.slice(0, 30);
  writeJson(STORAGE_HISTORY, history);
}

function getFavorites() {
  const saved = readJson(STORAGE_FAVORITES, null);
  if (Array.isArray(saved) && saved.length) return saved;
  return DEFAULT_FAVORITES;
}

function toggleFavorite(q) {
  const trimmed = q.trim();
  if (!trimmed) return;
  let favs = getFavorites();
  if (favs.includes(trimmed)) favs = favs.filter((x) => x !== trimmed);
  else favs = [trimmed, ...favs].slice(0, 20);
  writeJson(STORAGE_FAVORITES, favs);
  renderFavoriteChips();
}

function renderFavoriteChips() {
  const mount = $("favorite-chips");
  if (!mount) return;
  const favs = getFavorites();
  mount.innerHTML = favs
    .map(
      (q) =>
        `<button type="button" class="chip-btn" data-query="${escapeHtml(q)}" title="タップで検索 · 長押しでお気に入り解除">${escapeHtml(q)}</button>`
    )
    .join("");
  bindQueryChips(mount);
}

function renderRecentChips() {
  const mount = $("recent-chips");
  if (!mount) return;
  const recent = readJson(STORAGE_RECENT, []);
  if (!recent.length) {
    mount.innerHTML = '<span class="status-muted">まだありません</span>';
    return;
  }
  mount.innerHTML = recent
    .map((q) => `<button type="button" class="chip-btn" data-query="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
    .join("");
  bindQueryChips(mount);
}

function bindQueryChips(mount) {
  mount.querySelectorAll("[data-query]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("search-input").value = btn.getAttribute("data-query") || "";
      runSearch();
    });
    let pressTimer;
    btn.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => toggleFavorite(btn.getAttribute("data-query") || ""), 600);
    });
    btn.addEventListener("touchend", () => clearTimeout(pressTimer));
  });
}

function renderKindChips() {
  const mount = $("kind-chips");
  if (!mount) return;
  mount.innerHTML = Object.entries(KIND_LABELS)
    .map(
      ([kind, label]) =>
        `<button type="button" class="chip-btn${selectedKinds.has(kind) ? " active" : ""}" data-kind="${kind}">${label}</button>`
    )
    .join("");
  mount.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-kind");
      if (selectedKinds.has(kind)) selectedKinds.delete(kind);
      else selectedKinds.add(kind);
      renderKindChips();
      if ($("search-input")?.value?.trim()) runSearch();
    });
  });
}

async function loadCategories() {
  const token = getCustomerToken();
  const res = await fetch("/api/knowledge/categories", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  const sel = $("filter-category");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">すべて</option>';
  for (const c of data.categories || []) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function renderHit(hit) {
  const kindLabel = KIND_LABELS[hit.kind] || hit.kind;
  const flags = hitCapabilities(hit);
  const reasons = (hit.matchReasons || [])
    .map((r) => `<span class="reason-chip">${escapeHtml(r)}</span>`)
    .join("");
  const tags = (hit.tags || [])
    .slice(0, 6)
    .map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`)
    .join("");
  const plcExtra =
    hit.kind === "plc" && (hit.ladderDescription || hit.usage || hit.cautions)
      ? `<div class="plc-extra">
          ${hit.ladderDescription ? `<div><strong>ラダー:</strong> ${escapeHtml(hit.ladderDescription)}</div>` : ""}
          ${hit.usage ? `<div><strong>用途:</strong> ${escapeHtml(hit.usage)}</div>` : ""}
          ${hit.cautions ? `<div><strong>注意:</strong> ${escapeHtml(hit.cautions)}</div>` : ""}
        </div>`
      : "";
  const formats =
    hit.fileFormats?.length ? `<span class="tag-chip">${escapeHtml(hit.fileFormats.join("/"))}</span>` : "";
  const detailUrl = `/knowledge-detail-v1?id=${encodeURIComponent(hit.id)}&kind=${encodeURIComponent(hit.kind)}`;
  const actions = buildHitActionButtons(hit, flags, detailUrl);

  return `<article class="hit-item" data-id="${escapeHtml(hit.id)}">
    <h3>${escapeHtml(hit.title)}</h3>
    <p class="hit-meta">
      <span class="kind-chip">${escapeHtml(kindLabel)}</span>
      ${escapeHtml(hit.category || "")} · ${escapeHtml(hit.projectNo || "—")} · ${escapeHtml(hit.createdAt || "")}
      ${hit.status ? ` · ${escapeHtml(hit.status)}` : ""}
    </p>
    <p class="hit-summary">${escapeHtml(hit.summary)}</p>
    <div class="hit-reasons">${reasons}${formats}${tags}</div>
    ${renderFlagRow(flags, true)}
    ${plcExtra}
    <div class="hit-actions">${actions.join("")}</div>
  </article>`;
}

function renderHits(hits, total, searchMode) {
  lastHits = hits;
  const mount = $("search-results");
  const modeHint = searchMode === "or_fallback" ? " · カテゴリを広げて検索" : "";
  $("result-meta").textContent = total
    ? `${total}件ヒット（上位${hits.length}件表示${modeHint}）`
    : "該当なし";
  if (!hits.length) {
    mount.innerHTML = '<p class="status-muted">該当するナレッジがありません</p>';
    mount.className = "status-muted";
    return;
  }
  mount.className = viewMode === "cards" ? "results-cards" : "results-list";
  mount.innerHTML = hits.map(renderHit).join("");
  bindHitCardActions(mount, toast, (entry) => {
    logKnowledgeUsedV2({ ...entry, query: lastQuery });
    toast(`「${entry.title}」を使った記録を保存しました`);
  });
}

async function runSearch() {
  const q = $("search-input")?.value?.trim() ?? "";
  if (!q) {
    $("search-results").innerHTML = '<p class="status-muted">キーワードを入力してください</p>';
    $("result-meta").textContent = "キーワードを入力して検索";
    return;
  }
  lastQuery = q;
  const params = { q, limit: isMobileMode() ? "30" : "50" };
  const category = $("filter-category")?.value?.trim();
  const projectNo = $("filter-project-no")?.value?.trim();
  const dateFrom = $("filter-date-from")?.value;
  const dateTo = $("filter-date-to")?.value;
  if (category) params.category = category;
  if (projectNo) params.projectNo = projectNo;
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  if (selectedKinds.size) params.kinds = [...selectedKinds].join(",");

  $("search-results").innerHTML = '<p class="status-muted">検索中…</p>';
  try {
    const data = await apiSearch(params);
    renderHits(data.hits || [], data.total ?? 0, data.searchMode);
    pushRecentQuery(q);
    saveLastSearchResultsV2(q, data.hits || []);
    pushHistory({ q, category, projectNo, dateFrom, dateTo, kinds: [...selectedKinds] });
  } catch (e) {
    toast(e.message || "検索失敗");
    $("search-results").innerHTML = `<p class="status-muted">${escapeHtml(e.message || "検索失敗")}</p>`;
  }
}

function setViewMode(mode) {
  viewMode = mode;
  $("view-list")?.classList.toggle("active", mode === "list");
  $("view-cards")?.classList.toggle("active", mode === "cards");
  if (lastHits.length) renderHits(lastHits, lastHits.length);
}

async function init() {
  if (isMobileMode()) document.body.classList.add("mobile-mode");
  await requireCustomerLogin();
  initPracticalNav({ title: "🔍ナレッジ", active: "settings" });
  await loadCategories();
  renderKindChips();
  renderFavoriteChips();
  renderRecentChips();

  $("search-btn")?.addEventListener("click", runSearch);
  $("search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });
  $("filter-category")?.addEventListener("change", () => {
    if ($("search-input")?.value?.trim()) runSearch();
  });
  $("filter-project-no")?.addEventListener("change", () => {
    if ($("search-input")?.value?.trim()) runSearch();
  });
  $("filter-date-from")?.addEventListener("change", () => {
    if ($("search-input")?.value?.trim()) runSearch();
  });
  $("filter-date-to")?.addEventListener("change", () => {
    if ($("search-input")?.value?.trim()) runSearch();
  });
  $("view-list")?.addEventListener("click", () => setViewMode("list"));
  $("view-cards")?.addEventListener("click", () => setViewMode("cards"));

  const params = new URLSearchParams(location.search);
  const initialQ = params.get("q");
  if (initialQ) {
    $("search-input").value = initialQ;
    runSearch();
  }
}

init();

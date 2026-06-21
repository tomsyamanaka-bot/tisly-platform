import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import {
  CATEGORY_LAUNCHERS,
  EXAMPLE_SEARCHES,
  KIND_LAUNCHERS,
  KIND_LABELS,
  STORAGE_FIELD_FAVORITES,
  STORAGE_FIELD_RECENT,
  escapeHtml,
  getFieldFavorites,
  hitFlags,
  pushFieldRecent,
  readJson,
  tokenizeFieldMemo,
  writeJson,
} from "./knowledge-field-shared-v1.js";

const $ = (id) => document.getElementById(id);
let lastHits = [];
let activeKinds = "";
let activeCategory = "";

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
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

function renderExampleChips() {
  const mount = $("example-chips");
  if (!mount) return;
  mount.innerHTML = EXAMPLE_SEARCHES.map(
    (q) => `<button type="button" class="field-chip example" data-query="${escapeHtml(q)}">${escapeHtml(q)}</button>`
  ).join("");
  bindQueryButtons(mount);
}

function renderKindChips() {
  const mount = $("kind-chips");
  if (!mount) return;
  mount.innerHTML = KIND_LAUNCHERS.map(
    (k) =>
      `<button type="button" class="field-chip kind" data-kinds="${escapeHtml(k.kinds)}" data-query="${escapeHtml(k.query)}">${escapeHtml(k.label)}</button>`
  ).join("");
  mount.querySelectorAll("[data-kinds]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeKinds = btn.getAttribute("data-kinds") || "";
      activeCategory = "";
      const q = btn.getAttribute("data-query") || "";
      $("search-input").value = q;
      runSearch(q);
    });
  });
}

function renderCategoryChips() {
  const mount = $("category-chips");
  if (!mount) return;
  mount.innerHTML = CATEGORY_LAUNCHERS.map(
    (c) => `<button type="button" class="field-chip category" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join("");
  mount.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.getAttribute("data-category") || "";
      activeKinds = "";
      $("search-input").value = activeCategory;
      runSearch(activeCategory);
    });
  });
}

function renderFavoriteChips() {
  const mount = $("favorite-chips");
  if (!mount) return;
  const favs = getFieldFavorites();
  mount.innerHTML = favs
    .map(
      (q) =>
        `<button type="button" class="field-chip fav" data-query="${escapeHtml(q)}" title="タップで検索 · 長押しで削除">${escapeHtml(q)}</button>`
    )
    .join("");
  bindQueryButtons(mount, true);
}

function renderRecentChips() {
  const mount = $("recent-chips");
  if (!mount) return;
  const recent = readJson(STORAGE_FIELD_RECENT, []);
  if (!recent.length) {
    mount.innerHTML = '<span class="status-muted">まだありません</span>';
    return;
  }
  mount.innerHTML = recent
    .map((q) => `<button type="button" class="field-chip recent" data-query="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
    .join("");
  bindQueryButtons(mount);
}

function bindQueryButtons(mount, allowRemove = false) {
  mount.querySelectorAll("[data-query]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.getAttribute("data-query") || "";
      $("search-input").value = q;
      activeKinds = "";
      activeCategory = "";
      runSearch(q);
    });
    if (!allowRemove) return;
    let pressTimer;
    btn.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => removeFavorite(btn.getAttribute("data-query") || ""), 650);
    });
    btn.addEventListener("touchend", () => clearTimeout(pressTimer));
    btn.addEventListener("mousedown", () => {
      pressTimer = setTimeout(() => removeFavorite(btn.getAttribute("data-query") || ""), 800);
    });
    btn.addEventListener("mouseup", () => clearTimeout(pressTimer));
  });
}

function removeFavorite(q) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const favs = getFieldFavorites().filter((x) => x !== trimmed);
  writeJson(STORAGE_FIELD_FAVORITES, favs);
  renderFavoriteChips();
  toast(`「${trimmed}」を削除しました`);
}

function addFavorite() {
  const input = $("fav-add-input");
  const q = input?.value?.trim();
  if (!q) return;
  let favs = getFieldFavorites();
  if (!favs.includes(q)) favs = [q, ...favs].slice(0, 24);
  writeJson(STORAGE_FIELD_FAVORITES, favs);
  if (input) input.value = "";
  renderFavoriteChips();
  toast(`「${q}」を追加しました`);
}

function updateMemoPreview() {
  const text = $("memo-input")?.value ?? "";
  const tokens = tokenizeFieldMemo(text);
  const mount = $("memo-tokens-preview");
  if (!mount) return;
  if (!tokens.length) {
    mount.textContent = "分解キーワード: （入力すると表示）";
    return;
  }
  mount.innerHTML = `分解キーワード: ${tokens.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}`;
}

function renderFieldCard(hit) {
  const flags = hitFlags(hit);
  const kindLabel = KIND_LABELS[hit.kind] || hit.kind;
  const reasons = (hit.matchReasons || [])
    .map((r) => `<span class="reason-chip">${escapeHtml(r)}</span>`)
    .join("");
  const files = hit.filePath ? escapeHtml(hit.filePath.split(/[/\\]/).pop()) : "—";
  const detailUrl = `/knowledge-detail-v1?id=${encodeURIComponent(hit.id)}&kind=${encodeURIComponent(hit.kind)}`;

  const actions = [];
  actions.push(`<a class="primary" href="${detailUrl}">詳細</a>`);
  if (flags.pdf && hit.openUrl) {
    actions.push(`<a href="${escapeHtml(hit.openUrl)}">PDFを開く</a>`);
  }
  if (flags.photo && hit.openUrl) {
    actions.push(`<a href="${escapeHtml(hit.openUrl)}">写真を見る</a>`);
  }
  if (flags.plc || hit.kind === "esp") {
    actions.push(`<a href="${detailUrl}#template">テンプレを見る</a>`);
  }
  if (hit.filePath || hit.projectNo) {
    actions.push(
      `<button type="button" class="full" data-qnap="${escapeHtml(hit.filePath || hit.projectNo || "")}" data-title="${escapeHtml(hit.title)}">QNAP場所を表示</button>`
    );
  }

  return `<article class="field-card" data-id="${escapeHtml(hit.id)}">
    <h3>${escapeHtml(hit.title)}</h3>
    <p class="field-card-meta">${escapeHtml(kindLabel)} · ${escapeHtml(hit.category || "—")} · 案件 ${escapeHtml(hit.projectNo || "—")}</p>
    <div class="field-card-reasons">${reasons || '<span class="reason-chip">キーワード一致</span>'}</div>
    <p class="field-card-meta">関連ファイル: ${files}</p>
    <div class="flag-row">
      <span class="flag-badge${flags.photo ? " on" : ""}">📷 写真${flags.photo ? "あり" : ""}</span>
      <span class="flag-badge${flags.pdf ? " on" : ""}">📄 PDF${flags.pdf ? "あり" : ""}</span>
      <span class="flag-badge${flags.plc ? " on" : ""}">⚙ PLC${flags.plc ? "あり" : ""}</span>
      <span class="flag-badge${flags.print3d ? " on" : ""}">🖨 3DPrint${flags.print3d ? "あり" : ""}</span>
    </div>
    <div class="card-actions">${actions.join("")}</div>
  </article>`;
}

function renderHits(hits, total, queryLabel) {
  lastHits = hits;
  $("result-count").textContent = total ? `${total}件（${queryLabel}）` : "該当なし";
  const mount = $("search-results");
  if (!hits.length) {
    mount.innerHTML = '<p class="status-muted">該当するナレッジがありません</p>';
    return;
  }
  mount.innerHTML = hits.map(renderFieldCard).join("");
  mount.querySelectorAll("[data-qnap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.getAttribute("data-qnap") || "";
      const title = btn.getAttribute("data-title") || "";
      toast(`QNAP: ${title} → ${path || "AI/KnowledgeCards/"}`);
    });
  });
}

async function searchWithQuery(q) {
  const trimmed = q.trim();
  if (!trimmed) {
    $("search-results").innerHTML = '<p class="status-muted">キーワードを入力してください</p>';
    $("result-count").textContent = "—";
    return;
  }

  const params = { q: trimmed, limit: "30" };
  if (activeCategory) params.category = activeCategory;
  if (activeKinds) params.kinds = activeKinds;

  $("search-results").innerHTML = '<p class="status-muted">検索中…</p>';
  try {
    let data = await apiSearch(params);
    let hits = data.hits || [];

    if (!hits.length && trimmed.includes(" ")) {
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      const merged = new Map();
      for (const token of tokens) {
        const partParams = { q: token, limit: "15" };
        if (activeCategory) partParams.category = activeCategory;
        if (activeKinds) partParams.kinds = activeKinds;
        const part = await apiSearch(partParams);
        for (const h of part.hits || []) merged.set(`${h.kind}:${h.id}`, h);
      }
      hits = [...merged.values()].sort((a, b) => b.score - a.score);
      data = { ...data, hits, total: hits.length };
    }

    renderHits(hits, data.total ?? hits.length, trimmed);
    pushFieldRecent(trimmed);
  } catch (e) {
    toast(e.message || "検索失敗");
    $("search-results").innerHTML = `<p class="status-muted">${escapeHtml(e.message || "検索失敗")}</p>`;
  }
}

function runSearch(q) {
  const query = q ?? $("search-input")?.value ?? "";
  return searchWithQuery(query);
}

async function searchFromMemo() {
  const memo = $("memo-input")?.value?.trim() ?? "";
  if (!memo) {
    toast("現場メモを入力してください");
    return;
  }
  const tokens = tokenizeFieldMemo(memo);
  if (!tokens.length) {
    toast("キーワードを抽出できませんでした");
    return;
  }
  activeKinds = "";
  activeCategory = "";
  const query = tokens.join(" ");
  $("search-input").value = query;
  updateMemoPreview();
  await searchWithQuery(query);
}

async function init() {
  await requireCustomerLogin();
  initPracticalNav({ appId: "projects_v1", appName: "現場ナレッジ", theme: "hub" });

  renderExampleChips();
  renderKindChips();
  renderCategoryChips();
  renderFavoriteChips();
  renderRecentChips();

  $("search-btn")?.addEventListener("click", () => {
    activeKinds = "";
    runSearch();
  });
  $("clear-btn")?.addEventListener("click", () => {
    $("search-input").value = "";
    activeKinds = "";
    activeCategory = "";
    $("search-results").innerHTML = '<p class="status-muted">キーワードまたはチップをタップして検索</p>';
    $("result-count").textContent = "—";
  });
  $("search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      activeKinds = "";
      runSearch();
    }
  });
  $("fav-add-btn")?.addEventListener("click", addFavorite);
  $("fav-add-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFavorite();
  });
  $("memo-input")?.addEventListener("input", updateMemoPreview);
  $("memo-search-btn")?.addEventListener("click", searchFromMemo);

  const params = new URLSearchParams(location.search);
  const initialQ = params.get("q");
  if (initialQ) {
    $("search-input").value = initialQ;
    runSearch(initialQ);
  }
}

init();

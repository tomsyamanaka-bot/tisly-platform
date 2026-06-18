import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/master/v1";
const $ = (id) => document.getElementById(id);

let meta = { workCategories: [], materialCategories: [], chipFilters: [], missingFilters: [], categories: [], mainCategories: [] };
let activeTab = "customers";
let searchQ = "";
let favoriteOnly = false;
let categoryFilter = "";
let chipFilter = "";
let missingFilter = "";
let continuousMode = false;
let previewCustomerId = "";
let previewData = null;
let previewDraftId = null;
let previewDraftStatus = null;
let sketchIdFromUrl = "";
let bulkMode = false;
const bulkSelected = new Set();
let editContext = { mode: "create", tab: "customers", item: null };

let cache = {
  customers: [],
  ranks: [],
  workItems: [],
  materials: [],
  prices: [],
  mappings: [],
};

function toast(msg) {
  const el = $("toast");
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

function yen(n) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}

async function api(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
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
}

function queryString() {
  const p = new URLSearchParams();
  if (searchQ) p.set("q", searchQ);
  if (favoriteOnly) p.set("favoriteOnly", "true");
  if (missingFilter) p.set("missingFilter", missingFilter);
  else if (chipFilter) p.set("chip", chipFilter);
  else if (categoryFilter) p.set("categoryMain", categoryFilter);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function currentCategoryMain() {
  if (categoryFilter) return categoryFilter;
  if (chipFilter && chipFilter !== "__favorite__") return chipFilter;
  return "防犯カメラ";
}

function currentCategorySub() {
  const main = currentCategoryMain();
  const subs = (meta.categories || []).filter((c) => c.categoryMain === main);
  return subs[0]?.categorySub || "";
}

function categoryMainOptions(selected = "") {
  const mains = meta.mainCategories?.length
    ? meta.mainCategories
    : [...new Set((meta.categories || []).map((c) => c.categoryMain))];
  return mains.map((m) => ({ value: m, label: m, selected: m === selected }));
}

function categorySubOptions(main, selected = "") {
  const subs = (meta.categories || [])
    .filter((c) => c.categoryMain === main)
    .map((c) => c.categorySub);
  const unique = [...new Set(subs)];
  if (!unique.length) unique.push("");
  return unique.map((s) => ({ value: s, label: s || "—", selected: s === selected }));
}

async function loadMeta() {
  meta = await api("/meta");
}

async function loadTabData(tab) {
  switch (tab) {
    case "customers":
      cache.customers = (await api(`/customers${queryString()}`)).customers;
      break;
    case "ranks":
      cache.ranks = (await api(`/ranks${queryString()}`)).ranks;
      break;
    case "work":
      cache.workItems = (await api(`/work-items${queryString()}`)).workItems;
      break;
    case "materials":
      cache.materials = (await api(`/materials${queryString()}`)).materials;
      break;
    case "prices":
      cache.prices = (await api("/customer-prices")).prices;
      cache.customers = cache.customers.length
        ? cache.customers
        : (await api("/customers")).customers;
      cache.workItems = cache.workItems.length
        ? cache.workItems
        : (await api("/work-items")).workItems;
      cache.materials = cache.materials.length
        ? cache.materials
        : (await api("/materials")).materials;
      break;
    case "mappings":
      cache.mappings = (await api("/symbol-mappings")).mappings;
      break;
    case "categories":
      meta.categories = (await api("/categories")).categories;
      break;
    case "estimate-preview":
      if (!cache.customers.length) {
        cache.customers = (await api("/customers")).customers;
      }
      break;
  }
}

function renderCategoryChips() {
  const el = $("category-chips");
  if (activeTab !== "work" && activeTab !== "materials") {
    el.innerHTML = "";
    return;
  }
  const chips = meta.chipFilters?.length
    ? meta.chipFilters
    : [
        { value: "", label: "すべて" },
        { value: "__favorite__", label: "よく使う" },
        { value: "防犯カメラ", label: "防犯カメラ" },
        { value: "LAN / ネットワーク", label: "LAN" },
        { value: "電気工事", label: "電気" },
        { value: "照明", label: "照明" },
        { value: "セキュリティ", label: "セキュリティ" },
        { value: "その他", label: "その他" },
      ];
  const activeChip = chipFilter || (favoriteOnly ? "__favorite__" : categoryFilter);
  el.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="cat-chip${activeChip === c.value ? " active" : ""}" data-chip="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`
    )
    .join("");
  el.querySelectorAll(".cat-chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const v = btn.dataset.chip || "";
      chipFilter = v === "__favorite__" ? "" : v;
      favoriteOnly = v === "__favorite__";
      categoryFilter = v && v !== "__favorite__" ? v : "";
      $("btn-favorite-filter").classList.toggle("active", favoriteOnly);
      await refresh();
    });
  });
}

function renderMissingFilterChips() {
  const el = $("missing-filter-chips");
  if (activeTab !== "work" && activeTab !== "materials") {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const chips = meta.missingFilters?.length
    ? meta.missingFilters
    : [
        { value: "", label: "未入力なし" },
        { value: "cost", label: "原価未入力" },
        { value: "sell", label: "売価未入力" },
        { value: "supplier", label: "仕入先未入力" },
        { value: "model", label: "型番未入力" },
        { value: "category", label: "カテゴリ未設定" },
      ];
  el.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="cat-chip missing${missingFilter === c.value ? " active" : ""}" data-missing="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`
    )
    .join("");
  el.querySelectorAll("[data-missing]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      missingFilter = btn.dataset.missing || "";
      await refresh();
    });
  });
}

function updateQuickAddBar() {
  const bar = $("quick-add-bar");
  const show = activeTab === "work" || activeTab === "materials";
  bar.classList.toggle("hidden", !show);
  document.body.classList.toggle("has-quick-bar", show);
  if (show) {
    $("quick-add-name").placeholder = activeTab === "work" ? "作業名を入力…" : "材料名を入力…";
  }
}

async function quickSave(continueNext = false) {
  const name = $("quick-add-name").value.trim();
  if (!name) {
    toast("名前を入力してください");
    return;
  }
  const body = {
    name,
    categoryMain: currentCategoryMain(),
    categorySub: currentCategorySub(),
    unit: activeTab === "work" ? "式" : "個",
    standardCost: 0,
    laborCost: 0,
    cost: 0,
    standardSellPrice: 0,
  };
  const path = activeTab === "work" ? "/work-items" : "/materials";
  try {
    await api(path, { method: "POST", body: JSON.stringify(body) });
    toast(continueNext || continuousMode ? "保存 — 次を入力" : "クイック追加しました");
    $("quick-add-name").value = "";
    if (continueNext || continuousMode) {
      $("quick-add-name").focus();
    }
    await refresh();
  } catch (err) {
    toast(err.message || "保存に失敗");
  }
}

function cardHtml({ id, title, metaText, favorite, bulkEligible = true }) {
  const checked = bulkSelected.has(id) ? "checked" : "";
  const bulk = bulkMode && bulkEligible
    ? `<input type="checkbox" class="bulk-check" data-bulk-id="${escapeHtml(id)}" ${checked} />`
    : "";
  const star = favorite ? '<span class="fav-star">⭐</span>' : "";
  return `<div class="master-card" data-id="${escapeHtml(id)}">
    ${bulk}
    <div class="card-body">
      <div class="card-title">${star}${escapeHtml(title)}</div>
      <div class="card-meta">${metaText}</div>
    </div>
    <div class="card-actions">
      <button type="button" data-action="edit" data-id="${escapeHtml(id)}">編集</button>
      <button type="button" data-action="fav" data-id="${escapeHtml(id)}">${favorite ? "☆" : "⭐"}</button>
    </div>
  </div>`;
}

function renderCustomers() {
  const panel = $("panel-customers");
  if (!cache.customers.length) {
    panel.innerHTML = '<div class="master-empty">顧客がありません。＋で追加</div>';
    return;
  }
  const rankMap = Object.fromEntries(cache.ranks.map((r) => [r.id, r.name]));
  panel.innerHTML =
    '<div class="master-list-wrap">' +
    cache.customers
      .map((c) =>
        cardHtml({
          id: c.id,
          title: c.name,
          metaText: `${c.customerCode} · ${rankMap[c.rankId] || "ランク未設定"}`,
          favorite: c.favorite,
        })
      )
      .join("") +
    "</div>";
}

function renderRanks() {
  const panel = $("panel-ranks");
  if (!cache.ranks.length) {
    panel.innerHTML = '<div class="master-empty">ランクがありません</div>';
    return;
  }
  panel.innerHTML =
    '<div class="master-list-wrap">' +
    cache.ranks
      .map((r) =>
        cardHtml({
          id: r.id,
          title: r.name,
          metaText: `材料×${r.costMultiplier} / 労務×${r.laborMultiplier}`,
          favorite: false,
          bulkEligible: false,
        })
      )
      .join("") +
    "</div>";
}

function renderWork() {
  const panel = $("panel-work");
  if (!cache.workItems.length) {
    panel.innerHTML = '<div class="master-empty">作業マスターがありません</div>';
    return;
  }
  panel.innerHTML =
    '<div class="master-list-wrap">' +
    cache.workItems
      .map((w) => {
        const catLabel = w.categorySub ? `${w.categoryMain} › ${w.categorySub}` : w.categoryMain;
        const sell = w.standardSellPrice || w.standardCost + w.laborCost;
        return cardHtml({
          id: w.id,
          title: w.name,
          metaText: `${catLabel} · ${yen(sell)}/${w.unit} · 原価${yen(w.standardCost + w.laborCost)}`,
          favorite: w.favorite || w.isFavorite,
        });
      })
      .join("") +
    "</div>";
}

function renderMaterials() {
  const panel = $("panel-materials");
  if (!cache.materials.length) {
    panel.innerHTML = '<div class="master-empty">材料マスターがありません</div>';
    return;
  }
  panel.innerHTML =
    '<div class="master-list-wrap">' +
    cache.materials
      .map((m) => {
        const catLabel = m.categorySub ? `${m.categoryMain} › ${m.categorySub}` : m.categoryMain;
        const model = m.model ? ` ${m.model}` : "";
        const sell = m.standardSellPrice || m.cost * 2;
        return cardHtml({
          id: m.id,
          title: m.name,
          metaText: `${catLabel} · ${m.maker || ""}${model} · 売価${yen(sell)}`,
          favorite: m.favorite || m.isFavorite,
        });
      })
      .join("") +
    "</div>";
}

function renderPrices() {
  const panel = $("panel-prices");
  const custMap = Object.fromEntries(cache.customers.map((c) => [c.id, c.name]));
  const workMap = Object.fromEntries(cache.workItems.map((w) => [w.id, w.name]));
  const matMap = Object.fromEntries(cache.materials.map((m) => [m.id, m.name]));
  if (!cache.prices.length) {
    panel.innerHTML = '<div class="master-empty">顧客別単価がありません</div>';
    return;
  }
  panel.innerHTML =
    '<div class="master-list-wrap">' +
    cache.prices
      .map((p) => {
        const itemName =
          p.itemType === "work" ? workMap[p.itemId] : matMap[p.itemId];
        return cardHtml({
          id: p.id,
          title: `${custMap[p.customerId] || p.customerId} — ${itemName || p.itemId}`,
          metaText: `${p.itemType === "work" ? "作業" : "材料"} · 単価${yen(p.unitPrice)} / 原価${yen(p.costPrice)}`,
          favorite: false,
          bulkEligible: false,
        });
      })
      .join("") +
    "</div>";
}

function renderMappings() {
  const panel = $("panel-mappings");
  if (!cache.mappings.length) {
    panel.innerHTML = '<div class="master-empty">記号マッピングがありません</div>';
    return;
  }
  panel.innerHTML =
    '<div class="master-list-wrap">' +
    cache.mappings
      .map((m) => {
        const cat = m.categoryMain ? `${m.categoryMain}${m.categorySub ? " › " + m.categorySub : ""} · ` : "";
        const extras = (m.extraMaterialIds || []).length ? ` +${m.extraMaterialIds.length}材料` : "";
        return cardHtml({
          id: m.id,
          title: `${m.label} (${m.symbolType})`,
          metaText: `${cat}${m.mappingKind === "line" ? "線種" : "記号"} → 作業:${m.workItemId ? "✓" : "—"} 材料:${m.materialId ? "✓" : "—"}${extras}`,
          favorite: false,
          bulkEligible: false,
        });
      })
      .join("") +
    "</div>";
}

function renderCategories() {
  const panel = $("panel-categories");
  const cats = meta.categories || [];
  const toolbar =
    `<div class="cat-mgmt-toolbar">
      <button type="button" class="btn-sub" id="btn-cat-add-main">大カテゴリ追加</button>
      <button type="button" class="btn-sub" id="btn-cat-add-sub">中カテゴリ追加</button>
      <button type="button" class="btn-sub" id="btn-cat-save-order">並び順を保存</button>
    </div>`;
  if (!cats.length) {
    panel.innerHTML = toolbar + '<div class="master-empty">カテゴリがありません</div>';
    bindCategoryMgmtEvents();
    return;
  }
  const sorted = [...cats].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.categoryMain.localeCompare(b.categoryMain, "ja") || a.categorySub.localeCompare(b.categorySub, "ja")
  );
  const mains = [];
  const mainIndex = new Map();
  for (const c of sorted) {
    if (!mainIndex.has(c.categoryMain)) {
      mainIndex.set(c.categoryMain, mains.length);
      mains.push({ main: c.categoryMain, subs: [] });
    }
    mains[mainIndex.get(c.categoryMain)].subs.push(c);
  }
  panel.innerHTML =
    toolbar +
    '<div class="cat-sort-list" id="cat-sort-list">' +
    mains
      .map(
        (group, gi) => `<div class="cat-main-group" data-main-idx="${gi}">
          <div class="cat-main-head" draggable="true" data-cat-id="${escapeHtml(group.subs[0]?.id || "")}">
            <span class="cat-drag-handle">☰</span>
            <strong>${escapeHtml(group.main)}</strong>
            <button type="button" class="btn-icon btn-cat-main-up" data-main-idx="${gi}" ${gi === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="btn-icon btn-cat-main-down" data-main-idx="${gi}" ${gi === mains.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div class="cat-sub-list">${group.subs
            .map(
              (c, si) => {
                const kindLabel = c.kind === "work" ? "作業" : c.kind === "material" ? "材料" : "共通";
                return `<div class="cat-mgmt-card cat-sub-card${c.active ? "" : " inactive"}" draggable="true" data-cat-id="${escapeHtml(c.id)}" data-main-idx="${gi}" data-sub-idx="${si}">
                  <div class="cat-mgmt-row">
                    <span class="cat-drag-handle">☰</span>
                    <span>${escapeHtml(c.categorySub || "—")}</span>
                    <span class="cat-badge">${kindLabel}</span>
                    <small>順:${c.sortOrder}</small>
                    <button type="button" class="btn-icon btn-cat-sub-up" data-cat-id="${escapeHtml(c.id)}" ${si === 0 ? "disabled" : ""}>↑</button>
                    <button type="button" class="btn-icon btn-cat-sub-down" data-cat-id="${escapeHtml(c.id)}" ${si === group.subs.length - 1 ? "disabled" : ""}>↓</button>
                  </div>
                  <div class="cat-mgmt-row" style="margin-top:0.4rem">
                    <button type="button" class="btn-sub btn-cat-edit" data-id="${escapeHtml(c.id)}">編集</button>
                    <button type="button" class="btn-sub btn-cat-toggle" data-id="${escapeHtml(c.id)}">${c.active ? "OFF" : "ON"}</button>
                  </div>
                </div>`;
              }
            )
            .join("")}</div>
        </div>`
      )
      .join("") +
    "</div>";
  bindCategoryMgmtEvents();
  bindCategorySortEvents(mains);
}

function rebuildCategorySortFromGroups(mains) {
  let order = 0;
  for (const group of mains) {
    for (const c of group.subs) {
      c.sortOrder = order++;
    }
  }
  meta.categories = mains.flatMap((g) => g.subs);
}

function bindCategorySortEvents(mains) {
  const list = $("cat-sort-list");
  if (!list) return;

  list.querySelectorAll(".btn-cat-main-up").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.mainIdx);
      if (idx <= 0) return;
      [mains[idx - 1], mains[idx]] = [mains[idx], mains[idx - 1]];
      rebuildCategorySortFromGroups(mains);
      renderCategories();
    });
  });
  list.querySelectorAll(".btn-cat-main-down").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.mainIdx);
      if (idx >= mains.length - 1) return;
      [mains[idx + 1], mains[idx]] = [mains[idx], mains[idx + 1]];
      rebuildCategorySortFromGroups(mains);
      renderCategories();
    });
  });

  list.querySelectorAll(".btn-cat-sub-up, .btn-cat-sub-down").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".cat-sub-card");
      const mainIdx = Number(card?.dataset.mainIdx);
      const subIdx = Number(card?.dataset.subIdx);
      const group = mains[mainIdx];
      if (!group) return;
      if (btn.classList.contains("btn-cat-sub-up") && subIdx > 0) {
        [group.subs[subIdx - 1], group.subs[subIdx]] = [group.subs[subIdx], group.subs[subIdx - 1]];
      } else if (btn.classList.contains("btn-cat-sub-down") && subIdx < group.subs.length - 1) {
        [group.subs[subIdx + 1], group.subs[subIdx]] = [group.subs[subIdx], group.subs[subIdx + 1]];
      }
      rebuildCategorySortFromGroups(mains);
      renderCategories();
    });
  });

  let dragCatId = null;
  list.querySelectorAll("[draggable=true]").forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      dragCatId = el.dataset.catId;
      el.classList.add("dragging");
      ev.dataTransfer?.setData("text/plain", dragCatId || "");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      dragCatId = null;
    });
    el.addEventListener("dragover", (ev) => {
      ev.preventDefault();
    });
    el.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const targetId = el.dataset.catId;
      const sourceId = dragCatId || ev.dataTransfer?.getData("text/plain");
      if (!sourceId || !targetId || sourceId === targetId) return;
      reorderCategoryCards(sourceId, targetId);
      renderCategories();
    });
  });

  $("btn-cat-save-order")?.addEventListener("click", () => saveCategorySortOrder(mains), { once: true });
}

function reorderCategoryCards(sourceId, targetId) {
  const cats = meta.categories || [];
  const flat = [];
  const list = $("cat-sort-list");
  list?.querySelectorAll(".cat-sub-card").forEach((el) => {
    const c = cats.find((x) => x.id === el.dataset.catId);
    if (c) flat.push(c);
  });
  const from = flat.findIndex((c) => c.id === sourceId);
  const to = flat.findIndex((c) => c.id === targetId);
  if (from < 0 || to < 0) return;
  const [item] = flat.splice(from, 1);
  flat.splice(to, 0, item);
  meta.categories = flat;
}

async function saveCategorySortOrder(mains) {
  rebuildCategorySortFromGroups(mains);
  const orders = (meta.categories || []).map((c) => ({ id: c.id, sortOrder: c.sortOrder }));
  try {
    const res = await api("/categories/reorder", {
      method: "POST",
      body: JSON.stringify({ orders }),
    });
    meta.categories = res.categories || meta.categories;
    toast(`並び順を保存 (${res.updated}件)`);
    renderCategories();
  } catch (err) {
    toast(err.message || "並び順保存に失敗");
  }
}

function bindCategoryMgmtEvents() {
  $("btn-cat-add-main")?.addEventListener("click", () => openCategoryDialog("main"));
  $("btn-cat-add-sub")?.addEventListener("click", () => openCategoryDialog("sub"));
  document.querySelectorAll(".btn-cat-edit").forEach((btn) => {
    btn.addEventListener("click", () => openCategoryDialog("edit", btn.dataset.id));
  });
  document.querySelectorAll(".btn-cat-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cat = (meta.categories || []).find((c) => c.id === btn.dataset.id);
      if (!cat) return;
      await api(`/categories/${cat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !cat.active }),
      });
      toast(cat.active ? "カテゴリを無効化" : "カテゴリを有効化");
      meta.categories = (await api("/categories")).categories;
      renderCategories();
    });
  });
}

function openCategoryDialog(mode, id = null) {
  const cat = id ? (meta.categories || []).find((c) => c.id === id) : null;
  const fields = $("edit-fields");
  $("edit-title").textContent =
    mode === "main" ? "大カテゴリ追加" : mode === "sub" ? "中カテゴリ追加" : "カテゴリ編集";
  editContext.mode = mode === "edit" ? "edit" : "create";
  editContext.tab = "categories";
  editContext.item = cat;
  const mainVal = cat?.categoryMain || currentCategoryMain();
  fields.innerHTML =
    fieldHtml("大カテゴリ", "categoryMain", mainVal) +
    (mode !== "main"
      ? fieldHtml("中カテゴリ", "categorySub", cat?.categorySub || "")
      : fieldHtml("中カテゴリ", "categorySub", "（新規）")) +
    fieldHtml("種別", "kind", cat?.kind || "both", "select", [
      { value: "work", label: "作業用" },
      { value: "material", label: "材料用" },
      { value: "both", label: "共通" },
    ]) +
    fieldHtml("表示順", "sortOrder", cat?.sortOrder ?? 0, "number") +
    fieldHtml("有効", "active", cat?.active !== false, "checkbox");
  $("edit-dialog").showModal();
}

function computePreviewPricingSummary(p) {
  const lines = [...(p.workLines || []), ...(p.materialLines || [])];
  const customerOverrideCount = lines.filter((l) => l.priceSource === "customer_override").length;
  const rankCount = lines.filter((l) => l.priceSource === "rank_multiplier").length;
  const standardCount = lines.filter((l) => l.priceSource === "standard").length;
  const missingCostLines = lines.filter((l) => !l.unitCost || l.unitCost <= 0);
  return {
    totalCost: p.totalCost,
    totalSell: p.totalSell,
    grossProfit: p.grossProfit,
    grossProfitRate: p.grossProfitRate,
    customerOverrideCount,
    rankCount,
    standardCount,
    missingCostCount: missingCostLines.length,
    missingCostLabels: missingCostLines.map((l) => l.label),
  };
}

function previewPricingSummaryHtml(summary) {
  const warn =
    summary.missingCostCount > 0
      ? `<div class="preview-warn">⚠ 原価未入力 ${summary.missingCostCount}件: ${summary.missingCostLabels.slice(0, 3).map(escapeHtml).join("、")}${summary.missingCostCount > 3 ? "…" : ""}</div>`
      : "";
  return `<div class="preview-pricing-grid">
    <div class="pricing-stat"><span>原価合計</span><strong>${yen(summary.totalCost)}</strong></div>
    <div class="pricing-stat"><span>売価合計</span><strong>${yen(summary.totalSell)}</strong></div>
    <div class="pricing-stat"><span>粗利額</span><strong>${yen(summary.grossProfit)}</strong></div>
    <div class="pricing-stat"><span>粗利率</span><strong>${summary.grossProfitRate}%</strong></div>
    <div class="pricing-stat"><span>顧客上書き</span><strong>${summary.customerOverrideCount}件</strong></div>
    <div class="pricing-stat"><span>ランク反映</span><strong>${summary.rankCount}件</strong></div>
    <div class="pricing-stat"><span>標準売価</span><strong>${summary.standardCount}件</strong></div>
  </div>${warn}`;
}

function estimateApplyActionsHtml() {
  const applied = previewDraftStatus === "applied";
  const draftHint = previewDraftId
    ? `<p class="preview-draft-id">draft: ${escapeHtml(previewDraftId.slice(0, 8))}… ${applied ? '<span class="applied-badge">反映済み</span>' : ""}</p>`
    : "";
  return `${draftHint}
    <div class="preview-action-grid">
      <button type="button" class="btn-primary btn-apply-estimate" id="btn-save-draft"${applied ? " disabled" : ""}>見積候補を作成（draft保存）</button>
      <button type="button" class="btn-primary btn-apply-estimate" id="btn-apply-estimate"${!previewDraftId || applied ? " disabled" : ""}>見積に反映</button>
      <button type="button" class="btn-sub btn-open-estimate" id="btn-open-estimate-pwa"${!previewDraftId ? " disabled" : ""}>見積PWAで開く</button>
    </div>`;
}

function priceSourceLabel(src) {
  if (src === "customer_override") return '<span class="price-source override">顧客別</span>';
  if (src === "rank_multiplier") return '<span class="price-source rank">ランク</span>';
  if (src === "cost_double") return '<span class="price-source warn">原価2倍</span>';
  if (src === "missing") return '<span class="price-source warn">未入力</span>';
  return '<span class="price-source">標準</span>';
}

function previewLineHtml(line) {
  return `<div class="preview-line">
    <div class="line-title">${escapeHtml(line.label)} × ${line.qty}${escapeHtml(line.unit)} ${priceSourceLabel(line.priceSource)}</div>
    <div class="line-meta">
      原価 ${yen(line.totalCost)} · 売価 ${yen(line.totalSell)} · 粗利 ${yen(line.grossProfit)} (${line.grossProfitRate}%)
    </div>
  </div>`;
}

function renderEstimatePreview() {
  const panel = $("panel-estimate-preview");
  const custOpts = [
    { value: "", label: "顧客未選択（標準売価）" },
    ...cache.customers.map((c) => ({ value: c.id, label: c.name })),
  ];
  panel.innerHTML =
    `<div class="preview-toolbar">
      <input type="text" id="preview-sketch-id" placeholder="sketchId（URLから自動入力可）" value="${escapeHtml(sketchIdFromUrl)}" />
      <select id="preview-customer">${custOpts.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === previewCustomerId ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
      <button type="button" class="btn-primary" id="btn-preview-load">見積候補を読み込む</button>
    </div>
    <div id="preview-content"><div class="master-empty">sketchId を入力して読み込んでください</div></div>`;

  $("btn-preview-load").addEventListener("click", loadEstimatePreview);
  $("preview-customer").addEventListener("change", (e) => {
    previewCustomerId = e.target.value;
    if (previewData) loadEstimatePreview();
  });
  if (sketchIdFromUrl) loadEstimatePreview();
}

async function loadEstimatePreview() {
  sketchIdFromUrl = $("preview-sketch-id")?.value.trim() || sketchIdFromUrl;
  previewCustomerId = $("preview-customer")?.value || "";
  if (!sketchIdFromUrl) {
    toast("sketchId を入力してください");
    return;
  }
  const q = new URLSearchParams({ sketchId: sketchIdFromUrl });
  if (previewCustomerId) q.set("customerId", previewCustomerId);
  try {
    previewData = await api(`/estimate-preview?${q}`);
    previewDraftId = null;
    previewDraftStatus = null;
    try {
      const draftRes = await api(`/estimate-drafts/by-sketch/${encodeURIComponent(sketchIdFromUrl)}`);
      previewDraftId = draftRes.draft?.id || null;
      previewDraftStatus = draftRes.draft?.status || null;
    } catch {
      /* no draft yet */
    }
    renderPreviewContent();
  } catch (err) {
    toast(err.message || "プレビュー取得失敗");
  }
}

function renderPreviewContent() {
  const el = $("preview-content");
  if (!previewData) return;
  const p = previewData;
  const summary = computePreviewPricingSummary(p);
  el.innerHTML =
    `<div class="preview-summary">
      <div class="row"><span>記号</span><span>${p.symbolCount} / 配線 ${p.pathCount}</span></div>
      ${previewPricingSummaryHtml(summary)}
      <div class="total">税抜 ${yen(p.totalSell)}</div>
    </div>
    <div class="preview-section"><h3>作業候補 (${(p.workLines || []).length})</h3>${(p.workLines || []).map(previewLineHtml).join("") || '<div class="master-empty">なし</div>'}</div>
    <div class="preview-section"><h3>材料候補 (${(p.materialLines || []).length})</h3>${(p.materialLines || []).map(previewLineHtml).join("") || '<div class="master-empty">なし</div>'}</div>
    ${estimateApplyActionsHtml()}`;

  $("btn-save-draft")?.addEventListener("click", saveEstimateDraft);
  $("btn-apply-estimate")?.addEventListener("click", applyEstimateToEstimateV1);
  $("btn-open-estimate-pwa")?.addEventListener("click", openEstimatePwaFromDraft);
}

async function saveEstimateDraft() {
  if (!previewData) return;
  try {
    const res = await api("/estimate-preview/apply", {
      method: "POST",
      body: JSON.stringify({
        sketchId: sketchIdFromUrl,
        projectId: previewData.projectId,
        customerId: previewCustomerId || null,
        preview: previewData,
      }),
    });
    previewDraftId = res.draft.id;
    previewDraftStatus = res.draft.status;
    toast(`draft保存: ${res.draft.id.slice(0, 8)}…`);
    renderPreviewContent();
  } catch (err) {
    toast(err.message || "draft保存に失敗");
  }
}

async function applyEstimateToEstimateV1() {
  if (!previewDraftId) {
    toast("先に見積候補を作成してください");
    return;
  }
  try {
    const res = await api(`/estimate-drafts/${encodeURIComponent(previewDraftId)}/apply-to-estimate`, {
      method: "POST",
      body: "{}",
    });
    previewDraftStatus = "applied";
    toast("見積PWAへ反映しました");
    renderPreviewContent();
    if (res.estimateUrl) {
      setTimeout(() => {
        if (confirm("見積PWAで開きますか？")) location.href = res.estimateUrl;
      }, 300);
    }
  } catch (err) {
    toast(err.message || "見積反映に失敗");
  }
}

function openEstimatePwaFromDraft() {
  if (!previewDraftId) {
    toast("先に見積候補を作成してください");
    return;
  }
  location.href = `/estimate-v1?masterDraftId=${encodeURIComponent(previewDraftId)}`;
}

function renderActivePanel() {
  document.querySelectorAll(".master-panel").forEach((p) => p.classList.add("hidden"));
  const map = {
    customers: "panel-customers",
    ranks: "panel-ranks",
    work: "panel-work",
    materials: "panel-materials",
    prices: "panel-prices",
    mappings: "panel-mappings",
    categories: "panel-categories",
    "estimate-preview": "panel-estimate-preview",
  };
  $(map[activeTab]).classList.remove("hidden");
  switch (activeTab) {
    case "customers":
      renderCustomers();
      break;
    case "ranks":
      renderRanks();
      break;
    case "work":
      renderWork();
      break;
    case "materials":
      renderMaterials();
      break;
    case "prices":
      renderPrices();
      break;
    case "mappings":
      renderMappings();
      break;
    case "categories":
      renderCategories();
      break;
    case "estimate-preview":
      renderEstimatePreview();
      break;
  }
  bindCardActions();
  updateBulkBar();
  updateQuickAddBar();
}

async function refresh() {
  await loadTabData(activeTab);
  if (activeTab === "customers" && !cache.ranks.length) {
    cache.ranks = (await api("/ranks")).ranks;
  }
  renderCategoryChips();
  renderMissingFilterChips();
  renderActivePanel();
}

function switchTab(tab) {
  activeTab = tab;
  categoryFilter = "";
  chipFilter = "";
  missingFilter = "";
  favoriteOnly = false;
  $("btn-favorite-filter").classList.remove("active");
  bulkSelected.clear();
  document.querySelectorAll("#bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  refresh();
}

function bindCardActions() {
  document.querySelectorAll("[data-action=edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEdit(btn.dataset.id));
  });
  document.querySelectorAll("[data-action=fav]").forEach((btn) => {
    btn.addEventListener("click", () => toggleFavorite(btn.dataset.id));
  });
  document.querySelectorAll(".bulk-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.bulkId;
      if (cb.checked) bulkSelected.add(id);
      else bulkSelected.delete(id);
      updateBulkBar();
    });
  });
}

function updateBulkBar() {
  const bar = $("bulk-bar");
  if (!bulkMode || activeTab === "ranks" || activeTab === "prices" || activeTab === "mappings") {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  $("bulk-count").textContent = `${bulkSelected.size}件選択`;
}

async function toggleFavorite(id) {
  const entity =
    activeTab === "customers"
      ? cache.customers.find((c) => c.id === id)
      : activeTab === "work"
        ? cache.workItems.find((w) => w.id === id)
        : cache.materials.find((m) => m.id === id);
  if (!entity) return;
  const path =
    activeTab === "customers"
      ? `/customers/${id}`
      : activeTab === "work"
        ? `/work-items/${id}`
        : `/materials/${id}`;
  await api(path, {
    method: "PATCH",
    body: JSON.stringify({ favorite: !entity.favorite }),
  });
  toast(entity.favorite ? "よく使うを解除" : "よく使うに登録");
  await refresh();
}

function fieldHtml(label, name, value, type = "text", options = null) {
  if (type === "select" && options) {
    const opts = options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}"${String(value) === String(o.value) || o.selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");
    return `<label>${escapeHtml(label)}<select name="${name}" data-field="${name}">${opts}</select></label>`;
  }
  if (type === "textarea") {
    return `<label>${escapeHtml(label)}<textarea name="${name}" rows="2">${escapeHtml(value || "")}</textarea></label>`;
  }
  if (type === "checkbox") {
    const checked = value ? " checked" : "";
    return `<label class="toggle-row"><input name="${name}" type="checkbox" value="1"${checked} /><span>${escapeHtml(label)}</span></label>`;
  }
  return `<label>${escapeHtml(label)}<input name="${name}" type="${type}" value="${escapeHtml(value ?? "")}" inputmode="${type === "number" ? "decimal" : "text"}" /></label>`;
}

function categoryFields(prefix, item = {}) {
  const main = item.categoryMain || item.category || "防犯カメラ";
  const sub = item.categorySub || "";
  return (
    fieldHtml("大カテゴリ", `${prefix}CategoryMain`, main, "select", categoryMainOptions(main)) +
    fieldHtml("中カテゴリ", `${prefix}CategorySub`, sub, "select", categorySubOptions(main, sub))
  );
}

function openEdit(id) {
  editContext.mode = id ? "edit" : "create";
  editContext.tab = activeTab;
  const fields = $("edit-fields");
  $("edit-title").textContent = id ? "編集" : "新規追加";

  if (activeTab === "customers") {
    const c = id ? cache.customers.find((x) => x.id === id) : {};
    editContext.item = c;
    fields.innerHTML =
      fieldHtml("顧客名", "name", c?.name || "") +
      fieldHtml("顧客コード", "customerCode", c?.customerCode || "") +
      fieldHtml("ランク", "rankId", c?.rankId || "", "select", [
        { value: "", label: "—" },
        ...cache.ranks.map((r) => ({ value: r.id, label: r.name })),
      ]) +
      fieldHtml("担当者", "contactName", c?.contactName || "") +
      fieldHtml("電話", "phone", c?.phone || "", "tel") +
      fieldHtml("メモ", "memo", c?.memo || "", "textarea");
  } else if (activeTab === "ranks") {
    const r = id ? cache.ranks.find((x) => x.id === id) : {};
    editContext.item = r;
    fields.innerHTML =
      fieldHtml("ランク名", "name", r?.name || "") +
      fieldHtml("材料倍率", "costMultiplier", r?.costMultiplier ?? 2, "number") +
      fieldHtml("労務倍率", "laborMultiplier", r?.laborMultiplier ?? 2, "number") +
      fieldHtml("メモ", "memo", r?.memo || "", "textarea");
  } else if (activeTab === "work") {
    const w = id ? cache.workItems.find((x) => x.id === id) : {};
    editContext.item = w;
    fields.innerHTML =
      '<div class="form-grid">' +
      categoryFields("work", w) +
      fieldHtml("作業名", "name", w?.name || "") +
      fieldHtml("単位", "unit", w?.unit || "式") +
      fieldHtml("原価", "standardCost", w?.standardCost ?? 0, "number") +
      fieldHtml("労務原価", "laborCost", w?.laborCost ?? 0, "number") +
      fieldHtml("標準売価", "standardSellPrice", w?.standardSellPrice ?? 0, "number") +
      fieldHtml("デフォルト数量", "defaultQuantity", w?.defaultQuantity ?? 1, "number") +
      fieldHtml("タグ（カンマ区切り）", "tags", (w?.tags || []).join(", ")) +
      fieldHtml("よく使う", "isFavorite", w?.favorite || w?.isFavorite, "checkbox") +
      fieldHtml("メモ", "memo", w?.memo || "", "textarea") +
      "</div>";
    bindCategoryCascade("work");
  } else if (activeTab === "materials") {
    const m = id ? cache.materials.find((x) => x.id === id) : {};
    editContext.item = m;
    fields.innerHTML =
      '<div class="form-grid">' +
      categoryFields("material", m) +
      fieldHtml("材料名", "name", m?.name || "") +
      fieldHtml("型番", "model", m?.model || "") +
      fieldHtml("メーカー", "maker", m?.maker || "") +
      fieldHtml("仕入先", "supplier", m?.supplier || "") +
      fieldHtml("原価", "cost", m?.cost ?? 0, "number") +
      fieldHtml("標準売価", "standardSellPrice", m?.standardSellPrice ?? 0, "number") +
      fieldHtml("単位", "unit", m?.unit || "個") +
      fieldHtml("デフォルト数量", "defaultQuantity", m?.defaultQuantity ?? 1, "number") +
      fieldHtml("タグ（カンマ区切り）", "tags", (m?.tags || []).join(", ")) +
      fieldHtml("在庫管理対象", "stockManaged", m?.stockManaged, "checkbox") +
      fieldHtml("よく使う", "isFavorite", m?.favorite || m?.isFavorite, "checkbox") +
      fieldHtml("メモ", "memo", m?.memo || "", "textarea") +
      "</div>";
    bindCategoryCascade("material");
  } else if (activeTab === "prices") {
    const p = id ? cache.prices.find((x) => x.id === id) : {};
    editContext.item = p;
    fields.innerHTML =
      fieldHtml("顧客", "customerId", p?.customerId || "", "select", cache.customers.map((c) => ({ value: c.id, label: c.name }))) +
      fieldHtml("種別", "itemType", p?.itemType || "work", "select", [
        { value: "work", label: "作業" },
        { value: "material", label: "材料" },
      ]) +
      fieldHtml("作業ID", "workItemId", p?.itemType === "work" ? p?.itemId : "", "") +
      fieldHtml("材料ID", "materialItemId", p?.itemType === "material" ? p?.itemId : "", "") +
      fieldHtml("単価", "unitPrice", p?.unitPrice ?? 0, "number") +
      fieldHtml("原価", "costPrice", p?.costPrice ?? 0, "number");
  } else if (activeTab === "mappings") {
    const m = id ? cache.mappings.find((x) => x.id === id) : {};
    editContext.item = m;
    fields.innerHTML =
      '<div class="form-grid">' +
      fieldHtml("種別", "mappingKind", m?.mappingKind || "symbol", "select", [
        { value: "symbol", label: "記号" },
        { value: "line", label: "線種" },
      ]) +
      fieldHtml("symbolType", "symbolType", m?.symbolType || "") +
      fieldHtml("ラベル", "label", m?.label || "") +
      categoryFields("map", m) +
      fieldHtml("作業ID", "workItemId", m?.workItemId || "") +
      fieldHtml("主材料ID", "materialId", m?.materialId || "") +
      fieldHtml("追加材料ID（カンマ区切り）", "extraMaterialIds", (m?.extraMaterialIds || []).join(", ")) +
      fieldHtml("数量/単位", "qtyPerUnit", m?.qtyPerUnit ?? 1, "number") +
      fieldHtml("メモ", "memo", m?.memo || "", "textarea") +
      "</div>";
    bindCategoryCascade("map");
  } else if (activeTab === "categories") {
    return;
  }
  $("edit-dialog").showModal();
}

function bindCategoryCascade(prefix) {
  const mainSel = document.querySelector(`select[name="${prefix}CategoryMain"]`);
  const subSel = document.querySelector(`select[name="${prefix}CategorySub"]`);
  if (!mainSel || !subSel) return;
  mainSel.addEventListener("change", () => {
    const opts = categorySubOptions(mainSel.value, "");
    subSel.innerHTML = opts
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join("");
  });
}

async function saveEdit(e) {
  e.preventDefault();
  const fd = new FormData($("edit-form"));
  const body = Object.fromEntries(fd.entries());
  for (const k of [
    "standardCost", "laborCost", "cost", "unitPrice", "costPrice", "costMultiplier", "laborMultiplier",
    "qtyPerUnit", "standardSellPrice", "defaultQuantity",
  ]) {
    if (body[k] !== undefined && body[k] !== "") body[k] = Number(body[k]);
  }
  body.isFavorite = fd.get("isFavorite") === "1";
  body.stockManaged = fd.get("stockManaged") === "1";
  if (body.workCategoryMain) body.categoryMain = body.workCategoryMain;
  if (body.workCategorySub) body.categorySub = body.workCategorySub;
  if (body.materialCategoryMain) body.categoryMain = body.materialCategoryMain;
  if (body.materialCategorySub) body.categorySub = body.materialCategorySub;
  if (body.mapCategoryMain) body.categoryMain = body.mapCategoryMain;
  if (body.mapCategorySub) body.categorySub = body.mapCategorySub;
  if (body.tags && typeof body.tags === "string") {
    body.tags = body.tags.split(/[,、\s]+/).filter(Boolean);
  }
  if (body.extraMaterialIds && typeof body.extraMaterialIds === "string") {
    body.extraMaterialIds = body.extraMaterialIds.split(/[,、\s]+/).filter(Boolean);
  }
  try {
    if (activeTab === "categories") {
      const payload = {
        categoryMain: body.categoryMain,
        categorySub: body.categorySub || "（新規）",
        kind: body.kind || "both",
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
        active: fd.get("active") === "1",
      };
      if (editContext.mode === "edit" && editContext.item?.id) {
        await api(`/categories/${editContext.item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/categories", { method: "POST", body: JSON.stringify(payload) });
      }
      $("edit-dialog").close();
      toast("カテゴリを保存しました");
      meta.categories = (await api("/categories")).categories;
      await loadMeta();
      renderCategories();
      return;
    }
    if (activeTab === "prices" && body.workItemId) {
      body.itemId = body.workItemId;
      body.itemType = "work";
    } else if (activeTab === "prices" && body.materialItemId) {
      body.itemId = body.materialItemId;
      body.itemType = "material";
    }
    const paths = {
      customers: "/customers",
      ranks: "/ranks",
      work: "/work-items",
      materials: "/materials",
      prices: "/customer-prices",
      mappings: "/symbol-mappings",
    };
    const base = paths[activeTab];
    if (editContext.mode === "edit" && editContext.item?.id) {
      await api(`${base}/${editContext.item.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      await api(base, { method: "POST", body: JSON.stringify(body) });
    }
    $("edit-dialog").close();
    toast("保存しました");
    await refresh();
  } catch (err) {
    toast(err.message || "保存に失敗");
  }
}

async function bulkPatch(patch) {
  const entityMap = { customers: "customers", work: "work-items", materials: "materials" };
  const entity = entityMap[activeTab];
  if (!entity || !bulkSelected.size) return;
  await api("/bulk-update", {
    method: "POST",
    body: JSON.stringify({ entity, ids: [...bulkSelected], patch }),
  });
  bulkSelected.clear();
  toast("一括更新しました");
  await refresh();
}

function bindEvents() {
  document.querySelectorAll("#bottom-nav button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  let searchTimer;
  $("search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      searchQ = e.target.value.trim();
      await refresh();
    }, 300);
  });

  $("btn-favorite-filter").addEventListener("click", async () => {
    favoriteOnly = !favoriteOnly;
    $("btn-favorite-filter").classList.toggle("active", favoriteOnly);
    await refresh();
  });

  $("btn-bulk-mode").addEventListener("click", () => {
    bulkMode = !bulkMode;
    $("btn-bulk-mode").classList.toggle("active", bulkMode);
    if (!bulkMode) bulkSelected.clear();
    renderActivePanel();
  });

  $("btn-bulk-favorite").addEventListener("click", () => bulkPatch({ favorite: true }));
  $("btn-bulk-active").addEventListener("click", () => bulkPatch({ active: true }));
  $("btn-bulk-cancel").addEventListener("click", () => {
    bulkSelected.clear();
    bulkMode = false;
    $("btn-bulk-mode").classList.remove("active");
    renderActivePanel();
  });

  $("fab-add").addEventListener("click", () => openEdit(null));
  $("btn-quick-save")?.addEventListener("click", () => quickSave(false));
  $("btn-quick-save-next")?.addEventListener("click", () => quickSave(true));
  $("chk-continuous")?.addEventListener("change", (e) => {
    continuousMode = e.target.checked;
  });
  $("quick-add-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      quickSave(continuousMode);
    }
  });
  $("edit-form").addEventListener("submit", saveEdit);
  $("btn-edit-cancel").addEventListener("click", () => $("edit-dialog").close());

  $("btn-tools").addEventListener("click", () => $("tools-dialog").showModal());
  $("btn-tools-close").addEventListener("click", () => $("tools-dialog").close());

  document.querySelectorAll("[data-csv-export]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const entity = btn.dataset.csvExport;
      const token = getCustomerToken();
      const res = await fetch(`${API}/csv/${entity}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `master-v1-${entity}.csv`;
      a.click();
      toast("CSVをダウンロード");
    });
  });

  document.querySelectorAll("[data-csv-import]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const csv = await file.text();
      const entity = input.dataset.csvImport;
      const result = await api(`/csv/${entity}/import`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      toast(`取込 ${result.imported}件 / スキップ ${result.skipped}件`);
      input.value = "";
      await refresh();
    });
  });

  document.querySelectorAll("[data-storage-test]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kind = btn.dataset.storageTest;
      const result = await api("/storage-providers/test", {
        method: "POST",
        body: JSON.stringify({
          kind,
          config:
            kind === "webdav"
              ? { webdavUrl: "http://192.168.1.100:8080/TiSLY" }
              : kind === "qnap"
                ? { host: "192.168.1.100", port: 8080, shareName: "TiSLY" }
                : {},
        }),
      });
      $("storage-test-result").textContent = result.message;
    });
  });
}

async function init() {
  const session = await requireCustomerLogin();
  if (!session) return;
  initPracticalNav({ appId: "estimate_v1", appName: "見積マスター", theme: "green" });
  const params = new URLSearchParams(location.search);
  sketchIdFromUrl = params.get("sketchId") || "";
  if (sketchIdFromUrl) previewCustomerId = params.get("customerId") || "";
  await loadMeta();
  cache.ranks = (await api("/ranks")).ranks;
  bindEvents();
  if (sketchIdFromUrl) {
    switchTab("estimate-preview");
  } else {
    switchTab("customers");
  }
}

init();

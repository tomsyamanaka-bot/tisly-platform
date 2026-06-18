import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/master/v1";
const $ = (id) => document.getElementById(id);

let meta = { workCategories: [], materialCategories: [], chipFilters: [], categories: [], mainCategories: [] };
let activeTab = "customers";
let searchQ = "";
let favoriteOnly = false;
let categoryFilter = "";
let chipFilter = "";
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
  if (chipFilter) p.set("chip", chipFilter);
  else if (categoryFilter) p.set("categoryMain", categoryFilter);
  const s = p.toString();
  return s ? `?${s}` : "";
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

function renderActivePanel() {
  document.querySelectorAll(".master-panel").forEach((p) => p.classList.add("hidden"));
  const map = {
    customers: "panel-customers",
    ranks: "panel-ranks",
    work: "panel-work",
    materials: "panel-materials",
    prices: "panel-prices",
    mappings: "panel-mappings",
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
  }
  bindCardActions();
  updateBulkBar();
}

async function refresh() {
  await loadTabData(activeTab);
  if (activeTab === "customers" && !cache.ranks.length) {
    cache.ranks = (await api("/ranks")).ranks;
  }
  renderCategoryChips();
  renderActivePanel();
}

function switchTab(tab) {
  activeTab = tab;
  categoryFilter = "";
  chipFilter = "";
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
  initPracticalNav({ active: "estimate" });
  await loadMeta();
  cache.ranks = (await api("/ranks")).ranks;
  bindEvents();
  switchTab("customers");
}

init();

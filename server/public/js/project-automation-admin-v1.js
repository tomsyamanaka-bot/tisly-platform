import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/project-automation/v1/admin";
const PUBLIC_API = "/api/project-automation/v1";

const $ = (id) => document.getElementById(id);

let templates = [];
let categories = [];
let filterCategory = "all";
let sortMode = "order";
let searchQuery = "";
let editingId = null;
let editTab = "tasks";
let editItems = { tasks: [], tools: [], photos: [], "spec-photos": [] };

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
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderCategoryChips() {
  const el = $("category-chips");
  if (!el) return;
  const chips = [{ id: "all", label: "すべて" }].concat(
    categories.map((c) => ({ id: c, label: c }))
  );
  el.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="filter-chip${filterCategory === c.id ? " active" : ""}" data-cat="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`
    )
    .join("");
  el.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterCategory = btn.dataset.cat;
      renderCategoryChips();
      loadTemplates().catch((e) => toast(e.message));
    });
  });
}

function renderTemplateList() {
  const mount = $("template-list");
  if (!templates.length) {
    mount.innerHTML = `<p class="section-hint">テンプレートがありません</p>`;
    return;
  }
  mount.innerHTML = templates
    .map((t, idx) => {
      return `<article class="tpl-card${t.active ? "" : " inactive"}" data-id="${escapeHtml(t.id)}">
        <div class="tpl-card-head">
          <div>
            <strong>${escapeHtml(t.name)}</strong>
            <p class="section-hint" style="margin:0.2rem 0 0;">${escapeHtml(t.category)}${t.subCategory ? ` / ${escapeHtml(t.subCategory)}` : ""}</p>
          </div>
          <span class="status-badge">${t.active ? "有効" : "無効"}</span>
        </div>
        <div class="tpl-counts">
          <span class="tpl-count">やる事 ${t.taskCount}件</span>
          <span class="tpl-count">持ち物 ${t.toolCount}件</span>
          <span class="tpl-count">施工写真 ${t.photoCount}件</span>
          <span class="tpl-count">仕様書写真 ${t.specPhotoCount ?? 0}件</span>
          ${t.useCount ? `<span class="tpl-count">使用 ${t.useCount}回</span>` : ""}
        </div>
        <div class="tpl-actions sort-btns">
          <button type="button" data-action="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-action="down" data-idx="${idx}" ${idx === templates.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-action="edit" data-id="${escapeHtml(t.id)}">編集</button>
          <button type="button" data-action="toggle" data-id="${escapeHtml(t.id)}">${t.active ? "無効化" : "有効化"}</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(t.id)}">削除</button>
        </div>
      </article>`;
    })
    .join("");

  mount.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      try {
        if (action === "edit") {
          const tpl = await fetch(`${PUBLIC_API}/templates/${id}`, {
            headers: { Authorization: `Bearer ${getCustomerToken()}` },
          }).then((r) => r.json());
          openEditor(tpl);
        } else if (action === "toggle") {
          const t = templates.find((x) => x.id === id);
          await api(`/templates/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ active: !t?.active }),
          });
          toast(t?.active ? "無効化しました" : "有効化しました");
          await loadTemplates();
        } else if (action === "delete") {
          if (!window.confirm("このテンプレートを削除しますか？")) return;
          await api(`/templates/${id}`, { method: "DELETE" });
          toast("削除しました");
          await loadTemplates();
        } else if (action === "up" || action === "down") {
          const idx = Number(btn.dataset.idx);
          const next = action === "up" ? idx - 1 : idx + 1;
          if (next < 0 || next >= templates.length) return;
          const ids = templates.map((t) => t.id);
          [ids[idx], ids[next]] = [ids[next], ids[idx]];
          await api("/templates/reorder", { method: "PUT", body: JSON.stringify({ orderedIds: ids }) });
          await loadTemplates();
        }
      } catch (e) {
        toast(e.message);
      }
    });
  });
}

function renderSimpleItems() {
  const items = editItems[editTab] ?? [];
  $("edit-items").innerHTML = items
    .map(
      (it, i) => `<div class="item-row" data-idx="${i}">
        <input type="text" value="${escapeHtml(it.label)}" data-field="label" />
        <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-down="${i}" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" data-remove="${i}">✕</button>
      </div>`
    )
    .join("");
  bindItemRowEvents();
}

function renderSpecPhotoCards() {
  const items = editItems["spec-photos"] ?? [];
  $("edit-items").innerHTML = `<div class="spec-slot-grid" id="spec-slot-grid">${items
    .map(
      (it, i) => `
    <article class="spec-slot-card${it.active === false ? " inactive" : ""}" data-idx="${i}">
      <div class="spec-slot-card-head">
        <span class="spec-slot-order">${i + 1}</span>
        <div class="spec-slot-sort">
          <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="上へ">↑</button>
          <button type="button" data-down="${i}" ${i === items.length - 1 ? "disabled" : ""} aria-label="下へ">↓</button>
        </div>
        <button type="button" class="spec-slot-remove" data-remove="${i}" aria-label="削除">✕</button>
      </div>
      <label class="spec-slot-field">スロット名<input type="text" value="${escapeHtml(it.label)}" data-field="label" /></label>
      <label class="spec-slot-field spec-slot-check"><input type="checkbox" data-field="required" ${it.required ? "checked" : ""} /> 必須</label>
      <label class="spec-slot-field spec-slot-check"><input type="checkbox" data-field="active" ${it.active !== false ? "checked" : ""} /> 有効</label>
      <label class="spec-slot-field">説明メモ<textarea rows="2" data-field="memo">${escapeHtml(it.memo || "")}</textarea></label>
    </article>`
    )
    .join("")}</div>`;
  bindItemRowEvents();
}

function renderEditItems() {
  if (editTab === "spec-photos") {
    renderSpecPhotoCards();
    return;
  }
  renderSimpleItems();
}

function bindItemRowEvents() {
  $("edit-items").querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editItems[editTab].splice(Number(btn.dataset.remove), 1);
      renderEditItems();
    });
  });
  $("edit-items").querySelectorAll("[data-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.up);
      const arr = editItems[editTab];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      renderEditItems();
    });
  });
  $("edit-items").querySelectorAll("[data-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.down);
      const arr = editItems[editTab];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      renderEditItems();
    });
  });
}

function collectItemsFromDom() {
  const items = editItems[editTab];
  if (editTab === "spec-photos") {
    $("edit-items").querySelectorAll(".spec-slot-card").forEach((row, i) => {
      if (!items[i]) return;
      items[i].label = row.querySelector('[data-field="label"]')?.value?.trim() ?? "";
      items[i].required = row.querySelector('[data-field="required"]')?.checked ?? false;
      items[i].active = row.querySelector('[data-field="active"]')?.checked ?? true;
      items[i].memo = row.querySelector('[data-field="memo"]')?.value?.trim() || null;
    });
    return;
  }
  $("edit-items").querySelectorAll(".item-row").forEach((row, i) => {
    const label = row.querySelector('[data-field="label"]')?.value?.trim() ?? "";
    if (items[i]) items[i].label = label;
  });
}

function openEditor(tpl) {
  editingId = tpl?.id ?? null;
  $("editor-title").textContent = tpl ? "テンプレート編集" : "テンプレート追加";
  $("edit-name").value = tpl?.name ?? "";
  $("edit-category").value = tpl?.category ?? "";
  $("edit-subcategory").value = tpl?.subCategory ?? "";
  $("edit-desc").value = tpl?.description ?? "";
  $("edit-active").checked = tpl?.active !== false;
  editItems = {
    tasks: (tpl?.tasks ?? []).map((t) => ({ id: t.id, label: t.label })),
    tools: (tpl?.tools ?? []).map((t) => ({ id: t.id, label: t.label })),
    photos: (tpl?.photos ?? []).map((t) => ({ id: t.id, label: t.label })),
    "spec-photos": (tpl?.specPhotos ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      required: Boolean(t.required),
      memo: t.memo ?? null,
      active: t.active !== false,
    })),
  };
  editTab = "tasks";
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === editTab);
  });
  renderEditItems();
  $("editor-overlay").classList.remove("hidden");
}

function closeEditor() {
  editingId = null;
  $("editor-overlay").classList.add("hidden");
}

async function syncTemplateItems(templateId) {
  collectItemsFromDom();
  for (const kind of ["tasks", "tools", "photos", "spec-photos"]) {
    const items = editItems[kind].filter((it) => it.label);
    await api(`/templates/${templateId}/${kind}/reorder`, {
      method: "PUT",
      body: JSON.stringify({ orderedIds: items.map((it) => it.id).filter(Boolean) }),
    }).catch(() => {});
    for (const it of items) {
      const body =
        kind === "spec-photos"
          ? {
              label: it.label,
              required: Boolean(it.required),
              memo: it.memo ?? null,
              active: it.active !== false,
            }
          : { label: it.label };
      if (it.id) {
        await api(`/templates/${templateId}/${kind}/${it.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        const created = await api(`/templates/${templateId}/${kind}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        it.id = created.id;
      }
    }
  }
}

async function saveEditor() {
  const name = $("edit-name").value.trim();
  if (!name) {
    toast("名称を入力してください");
    return;
  }
  const body = {
    name,
    category: $("edit-category").value.trim(),
    subCategory: $("edit-subcategory").value.trim(),
    description: $("edit-desc").value.trim() || null,
    active: $("edit-active").checked,
  };
  try {
    let templateId = editingId;
    if (editingId) {
      await api(`/templates/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      const created = await api("/templates", { method: "POST", body: JSON.stringify(body) });
      templateId = created.id;
    }
    if (templateId) await syncTemplateItems(templateId);
    toast("保存しました");
    closeEditor();
    await loadTemplates();
  } catch (e) {
    toast(e.message);
  }
}

async function loadTemplates() {
  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  if (filterCategory !== "all") params.set("category", filterCategory);
  if (sortMode === "popular") params.set("sort", "popular");
  const qs = params.toString();
  const data = await api(`/templates${qs ? `?${qs}` : ""}`);
  templates = data.templates ?? [];
  categories = data.categories ?? [];
  renderCategoryChips();
  renderTemplateList();
}

async function init() {
  if (!requireCustomerLogin()) return;
  initPracticalNav({ appId: "settings_v1", appName: "テンプレ管理", theme: "hub" });

  $("btn-new-template")?.addEventListener("click", () => openEditor(null));
  $("btn-add-item")?.addEventListener("click", () => {
    if (editTab === "spec-photos") {
      editItems[editTab].push({ label: "", required: false, memo: null, active: true });
    } else {
      editItems[editTab].push({ label: "" });
    }
    renderEditItems();
  });
  $("btn-editor-cancel")?.addEventListener("click", closeEditor);
  $("btn-editor-save")?.addEventListener("click", () => saveEditor().catch((e) => toast(e.message)));
  $("editor-overlay")?.addEventListener("click", (ev) => {
    if (ev.target === $("editor-overlay")) closeEditor();
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectItemsFromDom();
      editTab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === editTab);
      });
      renderEditItems();
    });
  });
  $("search-q")?.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    clearTimeout(window._searchTimer);
    window._searchTimer = setTimeout(() => loadTemplates().catch((err) => toast(err.message)), 250);
  });
  $("sort-select")?.addEventListener("change", (e) => {
    sortMode = e.target.value;
    loadTemplates().catch((err) => toast(err.message));
  });

  await loadTemplates();
}

init().catch((e) => toast(e.message));

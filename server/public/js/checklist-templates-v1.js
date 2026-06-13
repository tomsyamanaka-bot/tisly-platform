import { customerCodeFromPath, getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

const API = "/api/field-checklist/v1";

const $ = (id) => document.getElementById(id);

let templates = [];
let editingId = null;
let editItems = [];

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
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function renderStats(stats) {
  $("stat-rate").textContent = `${stats.confirmationRate ?? 0}%`;
  $("stat-missed").textContent = String(stats.missedItems ?? 0);
  $("stat-projects").textContent = String(stats.projectCount ?? 0);
  $("stat-items").textContent = String(stats.totalItems ?? 0);
}

function renderTemplateList() {
  const mount = $("template-list");
  if (!templates.length) {
    mount.innerHTML = `<p class="section-hint">テンプレートがありません</p>`;
    return;
  }
  mount.innerHTML = templates
    .map(
      (t) => `<article class="tpl-card" data-id="${escapeHtml(t.id)}">
        <div class="tpl-card-head">
          <div>
            <strong>${escapeHtml(t.name)}</strong>
            ${t.description ? `<p class="section-hint" style="margin:0.25rem 0 0;">${escapeHtml(t.description)}</p>` : ""}
            <p class="tpl-card-meta">${t.items.length} 項目 · ${t.active ? "有効" : "無効"}</p>
          </div>
          <span class="status-badge">${t.active ? "有効" : "無効"}</span>
        </div>
        <ul class="tpl-items">${t.items.slice(0, 6).map((it) => `<li>${escapeHtml(it.label)}${it.photoRequired ? " 📷" : ""}</li>`).join("")}${t.items.length > 6 ? `<li>…他 ${t.items.length - 6} 件</li>` : ""}</ul>
        <div class="tpl-actions">
          <button type="button" data-action="edit" data-id="${escapeHtml(t.id)}">編集</button>
          <button type="button" data-action="duplicate" data-id="${escapeHtml(t.id)}">複製</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(t.id)}">削除</button>
        </div>
      </article>`
    )
    .join("");

  mount.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      try {
        if (action === "edit") openEditor(templates.find((t) => t.id === id));
        else if (action === "duplicate") {
          await api(`/templates/${encodeURIComponent(id)}/duplicate`, { method: "POST", body: "{}" });
          toast("複製しました");
          await loadAll();
        } else if (action === "delete") {
          if (!window.confirm("このテンプレートを削除しますか？")) return;
          await api(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
          toast("削除しました");
          await loadAll();
        }
      } catch (e) {
        toast(e.message || "操作に失敗しました");
      }
    });
  });
}

function renderEditItems() {
  $("edit-items").innerHTML = editItems
    .map(
      (it, i) => `<div class="item-row" data-idx="${i}">
        <input type="text" value="${escapeHtml(it.label)}" data-field="label" />
        <label><input type="checkbox" data-field="photoRequired" ${it.photoRequired ? "checked" : ""} />📷</label>
        <button type="button" data-remove="${i}">✕</button>
      </div>`
    )
    .join("");
  $("edit-items").querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editItems.splice(Number(btn.dataset.remove), 1);
      renderEditItems();
    });
  });
}

function openEditor(tpl) {
  editingId = tpl?.id ?? null;
  $("editor-title").textContent = tpl ? "テンプレート編集" : "テンプレート追加";
  $("edit-name").value = tpl?.name ?? "";
  $("edit-desc").value = tpl?.description ?? "";
  editItems = tpl?.items?.map((it) => ({ label: it.label, photoRequired: it.photoRequired })) ?? [
    { label: "電源確認", photoRequired: false },
  ];
  renderEditItems();
  $("editor-overlay").classList.remove("hidden");
}

function closeEditor() {
  editingId = null;
  $("editor-overlay").classList.add("hidden");
}

async function saveEditor() {
  const name = $("edit-name").value.trim();
  if (!name) {
    toast("名称を入力してください");
    return;
  }
  $("edit-items").querySelectorAll(".item-row").forEach((row, i) => {
    const label = row.querySelector('[data-field="label"]')?.value?.trim() ?? "";
    const photoRequired = row.querySelector('[data-field="photoRequired"]')?.checked ?? false;
    editItems[i] = { label, photoRequired };
  });
  const items = editItems.filter((it) => it.label);
  const body = { name, description: $("edit-desc").value.trim(), items };
  try {
    if (editingId) {
      await api(`/templates/${encodeURIComponent(editingId)}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      await api("/templates", { method: "POST", body: JSON.stringify(body) });
    }
    toast("保存しました。既存案件へ反映するには各案件の「テンプレートから同期」を実行してください");
    closeEditor();
    await loadAll();
  } catch (e) {
    toast(e.message || "保存に失敗しました");
  }
}

async function loadAll() {
  try {
    const [stats, tplData] = await Promise.all([
      api("/stats/monthly"),
      api("/templates?activeOnly=false"),
    ]);
    renderStats(stats);
    templates = tplData.templates || [];
    renderTemplateList();
  } catch (e) {
    $("template-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  const nav = initPracticalNav({ appId: "settings_v1", appName: "チェックリスト管理", theme: "hub" });
  nav.setToast(toast);
  nav.setBackHref("/settings-v1");

  $("btn-new-template").addEventListener("click", () => openEditor(null));
  $("btn-add-item").addEventListener("click", () => {
    editItems.push({ label: "", photoRequired: false });
    renderEditItems();
  });
  $("btn-editor-cancel").addEventListener("click", closeEditor);
  $("btn-editor-save").addEventListener("click", saveEditor);
  $("editor-overlay").addEventListener("click", (ev) => {
    if (ev.target === $("editor-overlay")) closeEditor();
  });

  await loadAll();
}

init().catch(console.error);

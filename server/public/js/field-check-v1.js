import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const CHECK_API = "/api/field-check/v1";

const $ = (id) => document.getElementById(id);

let currentProject = null;
let items = [];
let checkDate = todayIso();
let openMenuId = null;
let longPressTimer = null;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

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

async function api(base, path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(`${base}${path}`, {
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

function itemsQuery() {
  return `/items?source=${encodeURIComponent(currentProject.source)}&projectId=${encodeURIComponent(currentProject.id)}&date=${encodeURIComponent(checkDate)}`;
}

function showProjects() {
  $("view-projects").classList.remove("hidden");
  $("view-checklist").classList.add("hidden");
  currentProject = null;
}

function showChecklist() {
  $("view-projects").classList.add("hidden");
  $("view-checklist").classList.remove("hidden");
}

function updateProgress() {
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  const pct = total ? Math.round((checked / total) * 100) : 0;
  $("progress-fill").style.width = `${pct}%`;
  $("progress-text").innerHTML =
    total > 0
      ? `<span class="check-rate-badge">🎒 材料チェック ${checked}/${total}</span>（${pct}%）`
      : `<span class="check-rate-badge">材料がまだ登録されていません</span>`;
}

function closeAllMenus() {
  openMenuId = null;
  document.querySelectorAll(".check-item-menu").forEach((el) => el.remove());
  document.querySelectorAll(".check-item.menu-open").forEach((el) => el.classList.remove("menu-open"));
}

function toggleItemMenu(itemId, anchor) {
  if (openMenuId === itemId) {
    closeAllMenus();
    return;
  }
  closeAllMenus();
  openMenuId = itemId;
  const row = anchor.closest(".check-item");
  row?.classList.add("menu-open");
  const menu = document.createElement("div");
  menu.className = "check-item-menu";
  menu.innerHTML = `<button type="button" data-action="edit" data-id="${escapeHtml(itemId)}">編集</button>
    <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(itemId)}">削除</button>`;
  row?.appendChild(menu);
  menu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      closeAllMenus();
      if (action === "edit") await editItem(id);
      if (action === "delete") await deleteItem(id);
    });
  });
}

function renderItemRow(item) {
  const checkedCls = item.checked ? " checked" : "";
  return `<div class="check-item${checkedCls}" data-item-id="${escapeHtml(item.id)}">
    <input type="checkbox" id="chk-${escapeHtml(item.id)}" data-id="${escapeHtml(item.id)}" ${item.checked ? "checked" : ""} aria-label="${escapeHtml(item.label)}" />
    <label class="check-item-label" for="chk-${escapeHtml(item.id)}">${escapeHtml(item.label)}</label>
    <div class="check-item-actions">
      <button type="button" class="check-item-menu-btn" data-menu-id="${escapeHtml(item.id)}" aria-label="編集・削除">…</button>
    </div>
  </div>`;
}

function renderChecklist() {
  const el = $("checklist");
  if (!items.length) {
    el.innerHTML = `<div class="material-empty">
      <p>材料がまだ登録されていません</p>
      <button type="button" class="btn-primary" id="btn-empty-add">＋材料を追加</button>
    </div>`;
    el.querySelector("#btn-empty-add")?.addEventListener("click", () => $("material-input")?.focus());
    updateProgress();
    return;
  }
  el.innerHTML = items.map(renderItemRow).join("");
  bindChecklistEvents(el);
  updateProgress();
}

function bindChecklistEvents(root) {
  root.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      try {
        const updated = await api(CHECK_API, `/items/${cb.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ checked: cb.checked, checkDate }),
        });
        items = items.map((i) => (i.id === updated.id ? updated : i));
        items = sortItems(items);
        renderChecklist();
      } catch (e) {
        cb.checked = !cb.checked;
        toast(e.message);
      }
    });
  });

  root.querySelectorAll("[data-menu-id]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleItemMenu(btn.dataset.menuId, btn);
    });
    btn.addEventListener("touchstart", (ev) => {
      longPressTimer = setTimeout(() => {
        ev.preventDefault();
        toggleItemMenu(btn.dataset.menuId, btn);
      }, 500);
    }, { passive: false });
    btn.addEventListener("touchend", () => clearTimeout(longPressTimer));
    btn.addEventListener("touchmove", () => clearTimeout(longPressTimer));
  });

  root.querySelectorAll(".check-item").forEach((row) => {
    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const id = row.dataset.itemId;
      if (id) toggleItemMenu(id, row.querySelector("[data-menu-id]") || row);
    });
  });
}

function sortItems(list) {
  return [...list].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label, "ja");
  });
}

async function editItem(itemId) {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  const next = window.prompt("材料名を編集", item.label);
  if (next == null || !next.trim() || next.trim() === item.label) return;
  try {
    const updated = await api(CHECK_API, `/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ label: next.trim() }),
    });
    items = items.map((i) => (i.id === updated.id ? updated : i));
    renderChecklist();
    toast("材料名を更新しました");
  } catch (e) {
    toast(e.message);
  }
}

async function deleteItem(itemId) {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  if (!window.confirm(`「${item.label}」を削除しますか？`)) return;
  try {
    await api(CHECK_API, `/items/${itemId}`, { method: "DELETE" });
    items = items.filter((i) => i.id !== itemId);
    renderChecklist();
    toast("材料を削除しました");
  } catch (e) {
    toast(e.message);
  }
}

async function addMaterial() {
  const input = $("material-input");
  const label = input?.value?.trim();
  if (!label || !currentProject) return;
  try {
    const created = await api(CHECK_API, "/items", {
      method: "POST",
      body: JSON.stringify({
        projectSource: currentProject.source,
        projectId: currentProject.id,
        label,
      }),
    });
    items = sortItems([...items, created]);
    input.value = "";
    renderChecklist();
    input.focus();
  } catch (e) {
    toast(e.message);
  }
}

function renderSessions(sessions) {
  if (!sessions.length) {
    $("sessions").innerHTML = "<p class='section-hint'>まだ履歴がありません</p>";
    return;
  }
  $("sessions").innerHTML = sessions
    .map(
      (s) => `<div class="session-row">
        ${escapeHtml(s.completedAt.slice(0, 16).replace("T", " "))}
        — ${s.checkedCount}/${s.totalCount}
        ${s.allChecked ? "✅ 全て確認" : "⚠️ 未チェックあり"}
      </div>`
    )
    .join("");
}

async function addProject() {
  const input = $("project-title-input");
  const title = input?.value?.trim();
  if (!title) {
    toast("案件名を入力してください");
    input?.focus();
    return;
  }
  try {
    const created = await api(CHECK_API, "/projects", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    input.value = "";
    await loadProjects();
    await openProject({
      id: created.id,
      source: created.source,
      title: created.title,
    });
    toast("案件を追加しました");
  } catch (e) {
    toast(e.message);
  }
}

async function loadProjects() {
  const data = await api(CHECK_API, "/projects");
  const projects = data.projects || [];
  if (!projects.length) {
    $("project-list").innerHTML =
      "<p class='section-hint'>案件がありません。<br>上の入力欄から案件を追加するか、日程でGoogle同期後に自動生成された案件を選べます。</p>";
    return;
  }
  $("project-list").innerHTML = projects
    .map((p) => {
      const dateHint = p.eventDate ? `${escapeHtml(p.eventDate)} · ` : "";
      const progress =
        p.total > 0
          ? `🎒 ${p.checked}/${p.total}`
          : `<span class="section-hint">材料未登録</span>`;
      return `<article class="friendly-card project-card" data-id="${escapeHtml(p.id)}" data-source="${escapeHtml(p.source)}" data-title="${escapeHtml(p.title)}" data-date="${escapeHtml(p.eventDate || "")}" role="button" tabindex="0">
        <p><strong>${escapeHtml(p.title)}</strong></p>
        <p class="section-hint">${dateHint}${progress}</p>
      </article>`;
    })
    .join("");
  $("project-list").querySelectorAll(".project-card").forEach((card) => {
    const open = () => {
      if (card.dataset.date && /^\d{4}-\d{2}-\d{2}$/.test(card.dataset.date)) {
        checkDate = card.dataset.date;
      }
      openProject(card.dataset);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

async function loadItems() {
  const data = await api(CHECK_API, itemsQuery());
  items = sortItems(data.items || []);
  renderChecklist();
}

async function openProject(dataset) {
  currentProject = {
    id: dataset.id,
    source: dataset.source,
    title: dataset.title,
  };
  showChecklist();
  const dateHint = checkDate !== todayIso() ? `（${checkDate}）` : "";
  $("project-header").innerHTML = `<h3>${escapeHtml(currentProject.title)}</h3><p class="section-hint">出発前に材料を確認してください${escapeHtml(dateHint)}</p>`;
  try {
    await loadItems();
    const hist = await api(
      CHECK_API,
      `/sessions?source=${currentProject.source}&projectId=${currentProject.id}`
    );
    renderSessions(hist.sessions || []);
  } catch (e) {
    toast(e.message);
  }
}

async function openFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("projectId");
  const source = params.get("source") ?? "survey";
  const date = params.get("date");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date.slice(0, 10))) {
    checkDate = date.slice(0, 10);
  }
  if (!projectId) return false;
  try {
    const listed = await api(CHECK_API, "/projects");
    const match = (listed.projects || []).find((p) => p.id === projectId && p.source === source);
    await openProject({
      id: projectId,
      source,
      title: match?.title ?? "案件",
    });
    if (date) {
      $("project-header").insertAdjacentHTML(
        "beforeend",
        `<p class="section-hint">${escapeHtml(checkDate)} の現場 — 材料チェックを確認してください</p>`
      );
    }
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

async function completeSession() {
  if (!currentProject) return;
  try {
    const session = await api(CHECK_API, "/sessions", {
      method: "POST",
      body: JSON.stringify({
        projectSource: currentProject.source,
        projectId: currentProject.id,
        checkDate,
      }),
    });
    toast(session.allChecked ? "全て確認しました！" : "チェックを記録しました");
    const hist = await api(
      CHECK_API,
      `/sessions?source=${currentProject.source}&projectId=${currentProject.id}`
    );
    renderSessions(hist.sessions || []);
  } catch (e) {
    toast(e.message);
  }
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === "orders") {
    const q = new URLSearchParams(params);
    q.delete("tab");
    const qs = q.toString();
    location.replace(`/purchase-v1${qs ? `?${qs}` : ""}`);
    return;
  }

  await requireCustomerLogin();
  const nav = initPracticalNav({ appId: "field_check_v1", appName: "材料チェック", theme: "hub" });
  nav.setToast(toast);
  $("btn-back")?.addEventListener("click", showProjects);
  $("btn-complete")?.addEventListener("click", completeSession);
  $("btn-add-material")?.addEventListener("click", addMaterial);
  $("btn-add-project")?.addEventListener("click", addProject);
  $("project-title-input")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addProject();
    }
  });
  $("material-input")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addMaterial();
    }
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".check-item-menu") && !ev.target.closest("[data-menu-id]")) {
      closeAllMenus();
    }
  });
  const opened = await openFromQueryParams();
  if (!opened) {
    try {
      await loadProjects();
    } catch (e) {
      $("project-list").innerHTML = `<p>${escapeHtml(e.message)}</p>`;
    }
  }
}

main();

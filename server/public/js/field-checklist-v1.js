import { getCustomerToken, requireCustomerLogin, customerCodeFromPath } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";
import {
  bindFieldChecklistPanel,
  loadFieldChecklist,
  renderFieldChecklistPanel,
  buildDefaultChecklistItems,
  checklistStatusFromItems,
  TEMP_FIELD_PROJECT_ID,
} from "./field-checklist-ui.js?v=fc-ui-v3";
import { loadFieldChecklistLocal } from "./field-checklist-defaults-v1.js?v=fc-defaults-v1";
import { bindWorkSessionPanels, renderWorkSessionPanel } from "./work-session-ui.js";

const PROJECTS_API = "/api/projects/v1";
const WORK_API = "/api/work-session/v1";

const $ = (id) => document.getElementById(id);

let currentProject = null;
let tempChecklistItems = null;

function isTempProject(p) {
  return !p?.id || p.id === TEMP_FIELD_PROJECT_ID || String(p.id).startsWith("TEMP-");
}

async function renderTempChecklistView() {
  const p = currentProject;
  $("project-header").innerHTML = `<h3>${escapeHtml(p.title)}</h3><p class="section-hint">一時現場としてチェック中。案件を選ぶとサーバーに紐づきます。</p>`;

  tempChecklistItems = loadFieldChecklistLocal(p.id) || buildDefaultChecklistItems();

  const mount = $("checklist-mount");
  mount.innerHTML = renderFieldChecklistPanel({
    items: tempChecklistItems,
    status: checklistStatusFromItems(tempChecklistItems),
    showSyncButton: false,
  });
  bindFieldChecklistPanel(mount, {
    toast,
    projectId: p.id,
    localOnly: true,
    items: tempChecklistItems,
  });

  const wsMount = $("work-session-mount");
  wsMount.innerHTML = `<div class="friendly-card"><p class="section-hint">到着記録は案件選択後にサーバーへ保存されます。チェック項目は端末内に保存されます。</p></div>`;
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

async function apiFetch(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(path, {
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

async function api(path, opts = {}) {
  return apiFetch(`${PROJECTS_API}${path}`, opts);
}

async function workApi(path, opts = {}) {
  return apiFetch(`${WORK_API}${path}`, opts);
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

async function renderChecklistView() {
  if (!currentProject) return;
  if (isTempProject(currentProject)) {
    await renderTempChecklistView();
    return;
  }
  const p = currentProject;
  $("project-header").innerHTML = `<h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.customerName || "")}</p><p>📍 ${escapeHtml(p.address || "—")}</p>`;

  const data = await loadFieldChecklist(workApi, {
    projectSource: p.source,
    projectId: p.id,
  });
  const mount = $("checklist-mount");
  mount.innerHTML = renderFieldChecklistPanel({
    items: data.checklist || [],
    status: data.checklistStatus,
    showSyncButton: true,
    forceReason: data.session?.forceCompleteReason || data.checklistStatus?.forceCompleteReason || "",
  });
  bindFieldChecklistPanel(mount, {
    apiFetch: workApi,
    toast,
    projectSource: p.source,
    projectId: p.id,
    showSyncButton: true,
  });

  const wsMount = $("work-session-mount");
  const workDate = new Date().toISOString().slice(0, 10);
  wsMount.innerHTML = renderWorkSessionPanel({
    projectSource: p.source,
    projectId: p.id,
    workDate,
    session: data.session,
    checklist: [],
    compact: true,
  });
  bindWorkSessionPanels(wsMount, {
    apiFetch: workApi,
    toast,
    onUpdated: renderChecklistView,
  });
}

async function openProject(p) {
  currentProject = p;
  showChecklist();
  await renderChecklistView();
}

async function loadProjects() {
  try {
    const data = await api("/projects");
    const list = data.projects || [];
    const tempCard = `<article class="friendly-card project-pick-card" data-temp="1" style="border:2px solid #059669;">
      <strong>一時現場でチェック</strong>
      <p class="section-hint">案件未選択 · 端末内に保存</p>
    </article>`;
    if (!list.length) {
      $("project-list").innerHTML = `${tempCard}<p class="section-hint">案件がありません — 一時現場でチェックできます</p>`;
      $("project-list").querySelector("[data-temp]")?.addEventListener("click", () => openTempSite());
      return;
    }
    $("project-list").innerHTML = `${tempCard}${list
      .map(
        (p) => `<article class="friendly-card project-pick-card" data-id="${escapeHtml(p.id)}" data-source="${escapeHtml(p.source)}">
          <strong>${escapeHtml(p.title)}</strong>
          <p class="section-hint">${escapeHtml(p.customerName || "")}</p>
        </article>`
      )
      .join("")}`;
    $("project-list").querySelector("[data-temp]")?.addEventListener("click", () => openTempSite());
    $("project-list").querySelectorAll(".project-pick-card:not([data-temp])").forEach((card) => {
      card.addEventListener("click", () => {
        const p = list.find((x) => x.id === card.dataset.id && x.source === card.dataset.source);
        if (p) openProject(p);
      });
    });
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

function openTempSite() {
  currentProject = {
    id: TEMP_FIELD_PROJECT_ID,
    source: "temp",
    title: "一時現場",
    customerName: "",
    address: "—",
  };
  showChecklist();
  renderTempChecklistView();
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  const nav = initPracticalNav({ appId: "field_site_v1", appName: "現場チェック", theme: "green" });
  nav.setToast(toast);
  nav.setBackVisible(false);

  $("btn-back").addEventListener("click", () => {
    showProjects();
    loadProjects();
  });

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("projectId");
  const source = params.get("source") ?? "business";
  if (projectId) {
    try {
      const detail = await api(`/projects/${encodeURIComponent(projectId)}?source=${encodeURIComponent(source)}`);
      await openProject(detail.project);
      return;
    } catch {
      /* fall through */
    }
  }

  if (params.get("temp") === "1") {
    openTempSite();
    return;
  }

  await loadProjects();
}

init().catch(console.error);

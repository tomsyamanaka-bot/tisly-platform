import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

const API = "/api/projects/v1";
import { bindWorkSessionPanels, renderWorkSessionPanel } from "./work-session-ui.js";

const STAGE_ORDER = [
  "survey",
  "estimate",
  "ordered",
  "field_check",
  "purchase",
  "construction",
  "work_done",
  "invoice",
  "payment",
];
const STAGE_LABELS = {
  survey: "現調",
  estimate: "見積",
  ordered: "受注",
  field_check: "持ち物",
  purchase: "発注",
  construction: "施工中",
  work_done: "完了",
  invoice: "請求",
  payment: "入金",
};

const $ = (id) => document.getElementById(id);

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
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

async function workApi(path, opts = {}) {
  const token = getCustomerToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

let currentDetailRef = null;

function pipelineBarHtml(pipeline, { compact = false } = {}) {
  return STAGE_ORDER.map((s) => {
    const st = pipeline[s] ?? "pending";
    const icon = st === "done" ? "✅" : st === "active" ? "🔵" : "○";
    return `<div class="pipeline-step ${st}${compact ? " compact" : ""}" title="${STAGE_LABELS[s]}">
      <span class="step-icon">${icon}</span>
      <span class="step-label">${STAGE_LABELS[s]}</span>
    </div>`;
  }).join("");
}

function showList() {
  $("view-list").classList.remove("hidden");
  $("view-detail").classList.add("hidden");
}

function showDetail() {
  $("view-list").classList.add("hidden");
  $("view-detail").classList.remove("hidden");
}

function documentViewerHref(projectId, kind) {
  const params = new URLSearchParams({
    projectId,
    kind,
    return: `${window.location.pathname}${window.location.search}`,
  });
  return `/document-viewer-v1.html?${params}`;
}

function renderDetailDocuments(detail) {
  const mount = $("detail-documents");
  if (!mount) return;
  const p = detail.project;
  if (p.source !== "business") {
    mount.classList.add("hidden");
    mount.innerHTML = "";
    return;
  }
  const pipeline = p.pipeline || {};
  const hasInvoice = pipeline.invoice === "done" || pipeline.invoice === "active";
  const links = [
    { kind: "estimate", label: "見積書", show: true },
    { kind: "invoice", label: "請求書", show: hasInvoice },
    { kind: "specification", label: "仕様書", show: true },
    { kind: "completion-report", label: "完了報告書", show: true },
    { kind: "field-report", label: "現場報告", show: true },
  ].filter((l) => l.show);
  mount.classList.remove("hidden");
  mount.innerHTML = links
    .map(
      (l) =>
        `<a class="btn-doc-action" href="${escapeHtml(documentViewerHref(p.id, l.kind))}">${escapeHtml(l.label)}</a>`
    )
    .join("");
}

function renderTodayDeparture(todayDeparture) {
  const el = $("today-departure-card");
  if (!el) return;
  if (!todayDeparture) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const href = todayDeparture.fieldCheckUrl || "/field-check-v1";
  el.classList.remove("hidden");
  el.innerHTML = `<div class="friendly-card today-departure-card">
    <p class="section-label" style="margin-top:0;">🚐 今日の出発</p>
    <p>🚐 出発 <strong>${escapeHtml(todayDeparture.departureTime)}</strong></p>
    <p>🔔 持ち物通知 <strong>${escapeHtml(todayDeparture.reminderTime)}</strong>${todayDeparture.reminderEnabled ? "" : "（OFF）"}</p>
    ${todayDeparture.eventTitle ? `<p class="section-hint">${escapeHtml(todayDeparture.eventTitle)}</p>` : ""}
    <a class="btn-sub" href="${escapeHtml(href)}" style="display:inline-block;margin-top:0.35rem;">持ち物を見る</a>
  </div>`;
}

function renderDashboard(cards) {
  const grid = $("dashboard-grid");
  if (!cards?.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = cards
    .map(
      (c) => `<a href="${escapeHtml(c.href)}" class="dashboard-card" style="border-top:3px solid ${escapeHtml(c.themeColor)}">
        <div class="dash-count">${c.count}</div>
        <div class="dash-label">${escapeHtml(c.label)}</div>
      </a>`
    )
    .join("");
}

function renderList(projects) {
  if (!projects.length) {
    $("project-list").innerHTML = "<p>案件がありません</p>";
    return;
  }
  $("project-list").innerHTML = projects
    .map(
      (p) => `<article class="friendly-card project-card" data-id="${escapeHtml(p.id)}" data-source="${escapeHtml(p.source)}" role="button" tabindex="0">
        <p><strong>${escapeHtml(p.projectNo)}</strong> ${escapeHtml(p.title)}</p>
        <p class="section-hint">${escapeHtml(p.customerName)}</p>
        <p class="section-hint">📍 ${escapeHtml(p.address || "—")}</p>
        <p><span class="status-badge">${escapeHtml(p.statusLabel)}</span></p>
        <div class="pipeline-bar">${pipelineBarHtml(p.pipeline, { compact: true })}</div>
      </article>`
    )
    .join("");
  $("project-list").querySelectorAll(".project-card").forEach((card) => {
    const open = () => openDetail(card.dataset.id, card.dataset.source);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

function renderDetailWorkSession(detail) {
  const mount = $("detail-work-session");
  if (!mount) return;
  const p = detail.project;
  const workDate = new Date().toISOString().slice(0, 10);
  mount.innerHTML = renderWorkSessionPanel({
    projectSource: p.source,
    projectId: p.id,
    projectTitle: p.title,
    workDate,
    session: detail.workSession,
    checklist: detail.completionChecklist || [],
  });
  bindWorkSessionPanels(mount, {
    apiFetch: workApi,
    toast,
    onUpdated: async () => {
      if (currentDetailRef) await openDetail(currentDetailRef.id, currentDetailRef.source);
    },
  });
}

async function openDetail(id, source) {
  try {
    const detail = await api(`/projects/${id}?source=${encodeURIComponent(source)}`);
    currentDetailRef = { id, source };
    const p = detail.project;
    $("detail-header").innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.customerName)}</p>
      <p>📍 ${escapeHtml(p.address || "—")}</p>
      <p>番号: ${escapeHtml(p.projectNo)}</p>
      <p><span class="status-badge">${escapeHtml(p.statusLabel)}</span></p>`;
    $("detail-pipeline").innerHTML = pipelineBarHtml(p.pipeline);
    renderDetailWorkSession(detail);
    renderDetailDocuments(detail);
    $("detail-timeline").innerHTML = detail.timeline.length
      ? detail.timeline
          .map((t) => `<p><strong>${escapeHtml(t.date)}</strong> ${escapeHtml(t.label)} ${escapeHtml(t.detail)}</p>`)
          .join("")
      : "<p>履歴はまだありません</p>";
    showDetail();
    history.pushState({ projectId: id }, "", `?id=${id}&source=${source}`);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function loadList() {
  try {
    const [dash, data] = await Promise.all([api("/dashboard"), api("/projects")]);
    renderTodayDeparture(dash.todayDeparture);
    renderDashboard(dash.cards || []);
    renderList(data.projects || []);
  } catch (e) {
    $("project-list").innerHTML = `<div class="error-friendly">${renderFriendlyErrorHtml(e, e.status)}</div>`;
  }
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  const nav = initPracticalNav({ appId: "projects_v1", appName: "案件一覧", theme: "hub" });
  nav.setToast(toast);
  nav.setBackVisible(false);

  $("btn-back-list").addEventListener("click", () => {
    showList();
    history.replaceState({}, "", "/projects-v1");
  });

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const source = params.get("source") ?? "business";
  if (id) {
    await openDetail(id, source);
  } else {
    await loadList();
  }
}

init().catch(console.error);

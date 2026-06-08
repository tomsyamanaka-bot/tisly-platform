import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { renderFriendlyErrorHtml } from "./tisly-friendly-errors.js";

const API = "/api/projects/v1";
const STAGE_LABELS = {
  survey: "現調",
  estimate: "見積",
  construction: "施工",
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

async function api(path) {
  const token = getCustomerToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function pipelineHtml(pipeline) {
  const stages = ["survey", "estimate", "construction", "invoice", "payment"];
  return stages
    .map((s) => {
      const st = pipeline[s] ?? "pending";
      const icon = st === "done" ? "✅" : st === "active" ? "🔵" : "○";
      return `<span class="pipeline-chip">${icon}${STAGE_LABELS[s]}</span>`;
    })
    .join(" ");
}

function showList() {
  $("view-list").classList.remove("hidden");
  $("view-detail").classList.add("hidden");
}

function showDetail() {
  $("view-list").classList.add("hidden");
  $("view-detail").classList.remove("hidden");
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
        <div class="pipeline-row">${pipelineHtml(p.pipeline)}</div>
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

async function openDetail(id, source) {
  try {
    const detail = await api(`/projects/${id}?source=${encodeURIComponent(source)}`);
    const p = detail.project;
    $("detail-header").innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.customerName)}</p>
      <p>📍 ${escapeHtml(p.address || "—")}</p>
      <p>番号: ${escapeHtml(p.projectNo)}</p>
      <div class="pipeline-row">${pipelineHtml(p.pipeline)}</div>`;
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
    const data = await api("/projects");
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

import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const PROJECTS_API = "/api/projects/v1";
const CHECK_API = "/api/field-check/v1";
const PURCHASE_API = "/api/purchase/v1";

const $ = (id) => document.getElementById(id);

const CHECK_GROUPS = [
  { id: "material", label: "【材料】" },
  { id: "tool", label: "【工具】" },
  { id: "vehicle", label: "【車両】" },
];

const VEHICLE_LABELS = ["脚立", "作業灯", "はしご", "ラダー"];

let currentProject = null;
let items = [];

function classifyCheckItem(item) {
  const label = item.label || "";
  const cat = item.category || "";
  if (VEHICLE_LABELS.some((v) => label.includes(v)) || cat.includes("車両")) return "vehicle";
  if (cat.includes("工具") || item.itemType === "tool") return "tool";
  if (cat.includes("工具")) return "tool";
  return "material";
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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
  $("progress-text").innerHTML = `<span class="check-rate-badge">${checked} / ${total} 完了</span>（${pct}%）`;
}

function renderItemRow(item) {
  return `<div class="check-item">
    <input type="checkbox" id="chk-${escapeHtml(item.id)}" data-id="${escapeHtml(item.id)}" ${item.checked ? "checked" : ""} />
    <label for="chk-${escapeHtml(item.id)}">
      ${escapeHtml(item.label)}
      <span class="check-qty"> × ${item.quantity}${item.unit ? escapeHtml(item.unit) : ""}</span>
    </label>
  </div>`;
}

function renderShortageBanner(shortages) {
  const el = $("shortage-banner");
  if (!el) return;
  if (!shortages?.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = `<p class="shortage-title">⚠️ 不足あり</p>
    <ul class="shortage-list">${shortages
      .map((s) => `<li>${escapeHtml(s.label)} ${s.shortageQty}${s.unit ? escapeHtml(s.unit) : ""}</li>`)
      .join("")}</ul>`;
}

async function loadShortages() {
  if (!currentProject) return;
  try {
    const data = await api(PURCHASE_API, `/lines?source=${currentProject.source}&projectId=${currentProject.id}`);
    const shortages = (data.lines || []).filter((l) => l.shortageQty > 0);
    renderShortageBanner(shortages);
  } catch {
    renderShortageBanner([]);
  }
}

function renderChecklist() {
  if (!items.length) {
    $("checklist").innerHTML = "<p>持ち物がありません。現調で工事テンプレを選択してください。</p>";
    updateProgress();
    return;
  }
  const grouped = { material: [], tool: [], vehicle: [] };
  for (const item of items) {
    const g = classifyCheckItem(item);
    grouped[g].push(item);
  }
  $("checklist").innerHTML = CHECK_GROUPS.filter((g) => grouped[g.id].length)
    .map(
      (g) => `<div class="check-category">
        <p class="check-category-title">${g.label}</p>
        ${grouped[g.id].map(renderItemRow).join("")}
      </div>`
    )
    .join("");
  $("checklist").querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      try {
        const updated = await api(CHECK_API, `/items/${cb.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ checked: cb.checked }),
        });
        items = items.map((i) => (i.id === updated.id ? updated : i));
        updateProgress();
      } catch (e) {
        cb.checked = !cb.checked;
        toast(e.message);
      }
    });
  });
  updateProgress();
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

async function loadProjects() {
  const data = await api(PROJECTS_API, "/projects");
  const projects = data.projects || [];
  if (!projects.length) {
    $("project-list").innerHTML = "<p>案件がありません</p>";
    return;
  }
  $("project-list").innerHTML = projects
    .map(
      (p) => `<article class="friendly-card project-card" data-id="${escapeHtml(p.id)}" data-source="${escapeHtml(p.source)}" data-title="${escapeHtml(p.title)}" role="button" tabindex="0">
        <p><strong>${escapeHtml(p.projectNo)}</strong> ${escapeHtml(p.title)}</p>
        <p class="section-hint">${escapeHtml(p.customerName)}</p>
      </article>`
    )
    .join("");
  $("project-list").querySelectorAll(".project-card").forEach((card) => {
    const open = () => openProject(card.dataset);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}

async function openProject(dataset) {
  currentProject = {
    id: dataset.id,
    source: dataset.source,
    title: dataset.title,
  };
  showChecklist();
  $("project-header").innerHTML = `<h3>${escapeHtml(currentProject.title)}</h3><p class="section-hint">出発前に持ち物を確認してください</p>`;
  try {
    const data = await api(CHECK_API, `/items?source=${currentProject.source}&projectId=${currentProject.id}`);
    items = data.items || [];
    if (!items.length) {
      const gen = await api(CHECK_API, "/items/generate", {
        method: "POST",
        body: JSON.stringify({ projectSource: currentProject.source, projectId: currentProject.id }),
      });
      items = gen.items || [];
    }
    renderChecklist();
    await loadShortages();
    const hist = await api(CHECK_API, `/sessions?source=${currentProject.source}&projectId=${currentProject.id}`);
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
  if (!projectId) return false;
  try {
    const detail = await api(PROJECTS_API, `/projects/${projectId}?source=${encodeURIComponent(source)}`);
    const p = detail.project;
    await openProject({
      id: projectId,
      source,
      title: p?.title ?? "案件",
    });
    if (date) {
      $("project-header").insertAdjacentHTML(
        "beforeend",
        `<p class="section-hint">${escapeHtml(date)} の最初の現場 — 持ち物を確認してください</p>`
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
      }),
    });
    toast(session.allChecked ? "全て確認しました！" : "チェックを記録しました");
    const hist = await api(CHECK_API, `/sessions?source=${currentProject.source}&projectId=${currentProject.id}`);
    renderSessions(hist.sessions || []);
  } catch (e) {
    toast(e.message);
  }
}

async function main() {
  await requireCustomerLogin();
  const nav = initPracticalNav({ appId: "field_check_v1", appName: "持ち物", theme: "hub" });
  nav.setToast(toast);
  $("btn-back")?.addEventListener("click", showProjects);
  $("btn-complete")?.addEventListener("click", completeSession);
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

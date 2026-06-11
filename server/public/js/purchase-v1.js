import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const PROJECTS_API = "/api/projects/v1";
const PURCHASE_API = "/api/purchase/v1";

const STATUS_LABELS = {
  pending: "発注前",
  ordered: "発注済",
  received: "入荷済",
  carried: "現場持込済",
};

const NEXT_STATUS = {
  pending: "ordered",
  ordered: "received",
  received: "carried",
};

const $ = (id) => document.getElementById(id);

let currentProject = null;
let lines = [];
let activeFilter = "all";

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
  $("view-purchase").classList.add("hidden");
  currentProject = null;
}

function showPurchase() {
  $("view-projects").classList.add("hidden");
  $("view-purchase").classList.remove("hidden");
}

function renderSummary(summary) {
  if (!summary) return;
  $("summary").innerHTML = [
    `<span class="summary-chip">発注前 ${summary.pending}</span>`,
    `<span class="summary-chip">発注済 ${summary.ordered}</span>`,
    `<span class="summary-chip">入荷済 ${summary.received}</span>`,
    `<span class="summary-chip">持込済 ${summary.carried}</span>`,
  ].join("");
}

function renderTabs() {
  const tabs = [
    { id: "all", label: "すべて" },
    { id: "pending", label: "発注前" },
    { id: "ordered", label: "発注済" },
    { id: "received", label: "入荷済" },
    { id: "carried", label: "持込済" },
  ];
  $("status-tabs").innerHTML = tabs
    .map(
      (t) => `<button type="button" class="status-tab${activeFilter === t.id ? " active" : ""}" data-filter="${t.id}">${t.label}</button>`
    )
    .join("");
  $("status-tabs").querySelectorAll(".status-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      renderTabs();
      renderLines();
    });
  });
}

function lineVisualClass(line) {
  if (line.status === "carried") return { row: "status-carried", pill: "carried", label: "現場持込済" };
  if (line.status === "received") return { row: "status-received", pill: "received", label: "入荷済" };
  if (line.status === "ordered") return { row: "status-ordered", pill: "ordered", label: "発注済" };
  if (line.shortageQty > 0) return { row: "status-shortage", pill: "shortage", label: "不足材料" };
  return { row: "status-stock", pill: "stock", label: "在庫あり" };
}

function renderLines() {
  const filtered =
    activeFilter === "all" ? lines : lines.filter((l) => l.status === activeFilter);
  if (!filtered.length) {
    $("lines").innerHTML = "<p>該当する発注行がありません</p>";
    return;
  }
  $("lines").innerHTML = filtered
    .map((line) => {
      const vis = lineVisualClass(line);
      const next = NEXT_STATUS[line.status];
      const actionBtn = next
        ? `<button type="button" class="btn-sub btn-advance" data-id="${escapeHtml(line.id)}" data-next="${next}">→ ${STATUS_LABELS[next]}</button>`
        : "";
      return `<div class="purchase-line ${vis.row}">
        <p><strong>${escapeHtml(line.label)}</strong>
          <span class="purchase-status-pill ${vis.pill}">${vis.label}</span>
          <span class="status-badge">${STATUS_LABELS[line.status]}</span></p>
        <p class="line-meta">必要 ${line.qtyRequired}${line.unit || ""} / 発注 ${line.qtyOrdered}${line.unit || ""} / 不足 ${line.shortageQty}${line.unit || ""}</p>
        <p class="line-meta">在庫 ${line.stockQty ?? "—"}${line.unit || ""}${line.supplier ? ` / ${escapeHtml(line.supplier)}` : ""}</p>
        <div class="line-actions">${actionBtn}</div>
      </div>`;
    })
    .join("");
  $("lines").querySelectorAll(".btn-advance").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const updated = await api(PURCHASE_API, `/lines/${btn.dataset.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: btn.dataset.next }),
        });
        lines = lines.map((l) => (l.id === updated.id ? updated : l));
        const data = await api(PURCHASE_API, `/lines?source=${currentProject.source}&projectId=${currentProject.id}`);
        lines = data.lines || lines;
        renderSummary(data.summary);
        renderLines();
        toast(`${STATUS_LABELS[updated.status]}に更新`);
      } catch (e) {
        toast(e.message);
      }
    });
  });
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

async function loadPurchaseLines(regenerate = false) {
  const q = `?source=${currentProject.source}&projectId=${currentProject.id}`;
  let data;
  if (regenerate) {
    data = await api(PURCHASE_API, "/lines/generate", {
      method: "POST",
      body: JSON.stringify({ projectSource: currentProject.source, projectId: currentProject.id }),
    });
  } else {
    data = await api(PURCHASE_API, `/lines${q}`);
    if (!data.lines?.length) {
      data = await api(PURCHASE_API, "/lines/generate", {
        method: "POST",
        body: JSON.stringify({ projectSource: currentProject.source, projectId: currentProject.id }),
      });
    }
  }
  lines = data.lines || [];
  renderSummary(data.summary);
  renderTabs();
  renderLines();
}

async function openProject(dataset) {
  currentProject = { id: dataset.id, source: dataset.source, title: dataset.title };
  showPurchase();
  $("project-header").innerHTML = `<h3>${escapeHtml(currentProject.title)}</h3><p class="section-hint">不足材料の発注・入荷・持込を管理</p>`;
  try {
    await loadPurchaseLines(false);
  } catch (e) {
    toast(e.message);
  }
}

async function main() {
  await requireCustomerLogin();
  const nav = initPracticalNav({ appId: "purchase_v1", appName: "発注", theme: "orange" });
  nav.setToast(toast);
  $("btn-back")?.addEventListener("click", showProjects);
  $("btn-regenerate")?.addEventListener("click", async () => {
    if (!currentProject) return;
    try {
      await loadPurchaseLines(true);
      toast("不足分を再集計しました");
    } catch (e) {
      toast(e.message);
    }
  });
  try {
    await loadProjects();
  } catch (e) {
    $("project-list").innerHTML = `<p>${escapeHtml(e.message)}</p>`;
  }
}

main();

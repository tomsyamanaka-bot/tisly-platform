import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";
import { navigateTo } from "./tisly-navigation-stack-v1.js";

const API = "/api/project-mgmt/v1";
const AUTOMATION_API = "/api/project-automation/v1";

const $ = (id) => document.getElementById(id);

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

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
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
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let cityCodes = [];
let projectTemplates = [];
let debounceTimer = null;

function renderKpi(kpi) {
  const el = $("kpi-grid");
  if (!el || !kpi) return;
  const rate =
    kpi.orderRatePercent != null ? `${kpi.orderRatePercent}%` : "—";
  el.innerHTML = `
    <div class="kpi-card"><span class="kpi-val">${kpi.projectsThisMonth}</span><span class="kpi-lbl">今月案件数</span></div>
    <div class="kpi-card"><span class="kpi-val">${kpi.estimatesSubmitted}</span><span class="kpi-lbl">見積提出数</span></div>
    <div class="kpi-card"><span class="kpi-val">${kpi.ordersWon}</span><span class="kpi-lbl">受注数</span></div>
    <div class="kpi-card"><span class="kpi-val">${kpi.invoicedCount}</span><span class="kpi-lbl">請求済件数</span></div>
    <div class="kpi-card kpi-warn"><span class="kpi-val">${kpi.unpaidCount}</span><span class="kpi-lbl">未入金件数</span></div>
    <div class="kpi-card kpi-accent"><span class="kpi-val">${rate}</span><span class="kpi-lbl">受注率</span></div>`;
  const label = $("kpi-month-label");
  if (label) label.textContent = kpi.monthLabel ?? "";
}

function renderList(projects) {
  const list = $("project-list");
  const empty = $("empty-hint");
  if (!projects.length) {
    list.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  list.innerHTML = projects
    .map(
      (p) => `
    <article class="mgmt-card" data-id="${escapeHtml(p.id)}" tabindex="0" role="button">
      <div class="mgmt-card-head">
        <span class="mgmt-id">${escapeHtml(p.projectNo)}</span>
        <span class="mgmt-status mgmt-status-${escapeHtml(p.statusColor || "gray")}">${escapeHtml(p.mgmtStatusLabel)}</span>
      </div>
      <div class="mgmt-title">${escapeHtml(p.customerName)} — ${escapeHtml(p.title)}</div>
      <div class="mgmt-meta">作成: ${formatDate(p.createdAt)}${p.assignee ? ` · 担当: ${escapeHtml(p.assignee)}` : ""}${p.municipality ? ` · ${escapeHtml(p.municipality)}` : ""}</div>
      ${p.automation ? `<div class="mgmt-progress">やる事 ${p.automation.tasksPercent}% · 写真 ${p.automation.photosPercent}% · 書類 ${p.automation.documentsPercent}%</div>` : ""}
    </article>`
    )
    .join("");

  list.querySelectorAll(".mgmt-card").forEach((card) => {
    const open = () => {
      const id = card.getAttribute("data-id");
      navigateTo(`/project-mgmt-detail-v1?projectId=${encodeURIComponent(id)}&listReturn=${encodeURIComponent("/project-mgmt-v1")}`);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function buildSearchParams() {
  const params = new URLSearchParams();
  const q = $("search-q")?.value?.trim();
  const customerName = $("search-customer")?.value?.trim();
  const projectNo = $("search-project-no")?.value?.trim();
  const municipality = $("search-municipality")?.value?.trim();
  const assignee = $("search-assignee")?.value?.trim();
  const status = $("filter-status")?.value ?? "";
  if (q) params.set("q", q);
  if (customerName) params.set("customerName", customerName);
  if (projectNo) params.set("projectNo", projectNo);
  if (municipality) params.set("municipality", municipality);
  if (assignee) params.set("assignee", assignee);
  if (status) params.set("status", status);
  return params;
}

async function loadProjects() {
  const params = buildSearchParams();
  const qs = params.toString();
  const data = await api(`/projects${qs ? `?${qs}` : ""}`);
  renderKpi(data.kpi);
  renderList(data.projects ?? []);
}

function scheduleLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    loadProjects().catch((e) => toast(e.message));
  }, 250);
}

async function loadCityCodes() {
  const data = await api("/city-codes");
  cityCodes = data.cityCodes ?? [];
  const sel = $("create-city");
  if (!sel) return;
  sel.innerHTML = cityCodes
    .map((c) => `<option value="${escapeHtml(c.cityCode)}">${escapeHtml(c.cityName)}</option>`)
    .join("");
  const muniSel = $("search-municipality");
  if (muniSel && muniSel.tagName === "SELECT") {
    muniSel.innerHTML =
      `<option value="">すべての市区町村</option>` +
      cityCodes
        .map((c) => `<option value="${escapeHtml(c.cityName)}">${escapeHtml(c.cityName)}</option>`)
        .join("");
  }
}

function toggleCreate(show) {
  $("create-panel")?.classList.toggle("hidden", !show);
  $("btn-toggle-create")?.classList.toggle("hidden", show);
}

async function saveCreate() {
  const title = $("create-title")?.value?.trim();
  const customerName = $("create-customer")?.value?.trim();
  if (!title || !customerName) {
    toast("案件名と顧客名は必須です");
    return;
  }
  const cityCode = $("create-city")?.value;
  const city = cityCodes.find((c) => c.cityCode === cityCode);
  const body = {
    title,
    customerName,
    phone: $("create-phone")?.value?.trim() || undefined,
    address: $("create-address")?.value?.trim() || undefined,
    municipality: city?.cityName,
    assignee: $("create-assignee")?.value?.trim() || undefined,
    cityCode,
    templateId: $("create-template")?.value?.trim() || undefined,
  };
  const data = await api("/projects", { method: "POST", body: JSON.stringify(body) });
  toast(`案件 ${data.project.projectNo} を作成しました`);
  toggleCreate(false);
  navigateTo(`/project-mgmt-detail-v1?projectId=${encodeURIComponent(data.project.id)}&listReturn=${encodeURIComponent("/project-mgmt-v1")}`);
}

async function loadProjectTemplates() {
  const token = getCustomerToken();
  const res = await fetch(`${AUTOMATION_API}/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  projectTemplates = data.templates ?? [];
  const sel = $("create-template");
  if (!sel) return;
  sel.innerHTML =
    `<option value="">— 選択してください —</option>` +
    projectTemplates
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
      .join("");
  sel.addEventListener("change", () => renderTemplatePreview(sel.value));
}

function renderTemplatePreview(templateId) {
  const el = $("template-preview");
  if (!el) return;
  const tpl = projectTemplates.find((t) => t.id === templateId);
  if (!tpl) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = `
    <strong>このテンプレから自動生成されます</strong>
    <div style="font-weight:700;margin-bottom:0.2rem;">${escapeHtml(tpl.name)}</div>
    <ul>
      <li>やる事 ${tpl.taskCount}件</li>
      <li>持ち物 ${tpl.toolCount}件</li>
      <li>写真 ${tpl.photoCount}件</li>
    </ul>`;
}

async function main() {
  if (!requireCustomerLogin()) return;
  initPracticalNav({ appId: "project_mgmt_v1", appName: "案件", theme: "blue" });

  await loadCityCodes();
  await loadProjectTemplates().catch(() => {});
  await loadProjects();

  $("search-q")?.addEventListener("input", scheduleLoad);
  $("search-customer")?.addEventListener("input", scheduleLoad);
  $("search-project-no")?.addEventListener("input", scheduleLoad);
  $("search-municipality")?.addEventListener("change", scheduleLoad);
  $("search-assignee")?.addEventListener("input", scheduleLoad);
  $("filter-status")?.addEventListener("change", () => loadProjects().catch((e) => toast(e.message)));
  $("btn-toggle-create")?.addEventListener("click", () => toggleCreate(true));
  $("btn-cancel-create")?.addEventListener("click", () => toggleCreate(false));
  $("btn-save-create")?.addEventListener("click", () => saveCreate().catch((e) => toast(e.message)));
}

main().catch((e) => toast(e.message));

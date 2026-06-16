import { getCustomerToken, requireCustomerLogin } from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/project-mgmt/v1";

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
let debounceTimer = null;

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
        <span class="mgmt-status">${escapeHtml(p.mgmtStatusLabel)}</span>
      </div>
      <div class="mgmt-title">${escapeHtml(p.customerName)} — ${escapeHtml(p.title)}</div>
      <div class="mgmt-meta">作成: ${formatDate(p.createdAt)}${p.address ? ` · ${escapeHtml(p.address)}` : ""}</div>
    </article>`
    )
    .join("");

  list.querySelectorAll(".mgmt-card").forEach((card) => {
    const open = () => {
      const id = card.getAttribute("data-id");
      window.location.href = `/project-mgmt-detail-v1?projectId=${encodeURIComponent(id)}`;
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

async function loadProjects() {
  const q = $("search-q")?.value ?? "";
  const status = $("filter-status")?.value ?? "";
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  const qs = params.toString();
  const data = await api(`/projects${qs ? `?${qs}` : ""}`);
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
  };
  const data = await api("/projects", { method: "POST", body: JSON.stringify(body) });
  toast(`案件 ${data.project.projectNo} を作成しました`);
  toggleCreate(false);
  window.location.href = `/project-mgmt-detail-v1?projectId=${encodeURIComponent(data.project.id)}`;
}

async function main() {
  if (!requireCustomerLogin()) return;
  initPracticalNav({ appId: "project_mgmt_v1", appName: "案件管理", theme: "blue" });

  await loadCityCodes();
  await loadProjects();

  $("search-q")?.addEventListener("input", scheduleLoad);
  $("filter-status")?.addEventListener("change", () => loadProjects().catch((e) => toast(e.message)));
  $("btn-toggle-create")?.addEventListener("click", () => toggleCreate(true));
  $("btn-cancel-create")?.addEventListener("click", () => toggleCreate(false));
  $("btn-save-create")?.addEventListener("click", () => saveCreate().catch((e) => toast(e.message)));
}

main().catch((e) => toast(e.message));

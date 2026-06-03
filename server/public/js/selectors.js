import { apiGet } from "./api.js";

export async function mountSiteSelector(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const data = await apiGet("/api/sites");
  const saved = localStorage.getItem("tisly.selectedSiteId") ?? "";
  el.innerHTML = `
    <label>現場 <select id="site-selector-select">
      <option value="">すべて</option>
      ${data.sites.map((s) => `<option value="${s.id}" ${s.id === saved ? "selected" : ""}>${s.name}</option>`).join("")}
    </select></label>`;
  el.querySelector("select")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (v) localStorage.setItem("tisly.selectedSiteId", v);
    else localStorage.removeItem("tisly.selectedSiteId");
    onChange?.(v);
  });
}

export async function mountTenantSelector(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const data = await apiGet("/api/tenants");
  const saved = localStorage.getItem("tisly.selectedTenantId") ?? data.defaultTenantId;
  el.innerHTML = `
    <label>顧客 <select id="tenant-selector-select">
      ${data.tenants.map((t) => `<option value="${t.id}" ${t.id === saved ? "selected" : ""}>${t.name}</option>`).join("")}
    </select></label>`;
  el.querySelector("select")?.addEventListener("change", (e) => {
    localStorage.setItem("tisly.selectedTenantId", e.target.value);
    onChange?.(e.target.value);
  });
}

export function getSelectedSiteId() {
  return localStorage.getItem("tisly.selectedSiteId") ?? "";
}

export function getSelectedTenantId() {
  return localStorage.getItem("tisly.selectedTenantId") ?? "default";
}

const CUSTOMER_SCOPE_OPTIONS = [
  { code: "ALL", label: "全顧客" },
  { code: "TOMS001", label: "TOMS001" },
  { code: "HOTEL001", label: "HOTEL001" },
  { code: "PLANT001", label: "PLANT001" },
];

export function mountCustomerScopeSelector(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const saved = localStorage.getItem("tisly.selectedCustomerScope") ?? "ALL";
  el.innerHTML = `
    <label>Customer Scope
      <select id="customer-scope-select">
        ${CUSTOMER_SCOPE_OPTIONS.map(
          (o) =>
            `<option value="${o.code}" ${o.code === saved ? "selected" : ""}>${o.label}</option>`
        ).join("")}
      </select>
    </label>`;
  el.querySelector("select")?.addEventListener("change", (e) => {
    localStorage.setItem("tisly.selectedCustomerScope", e.target.value);
    onChange?.(e.target.value);
  });
}

export function getSelectedCustomerScope() {
  return localStorage.getItem("tisly.selectedCustomerScope") ?? "ALL";
}

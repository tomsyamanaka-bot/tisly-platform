import { apiGet, apiPost } from "./api.js";

const form = document.getElementById("site-form");
const siteTypeEl = document.getElementById("siteType");
const customerCodeEl = document.getElementById("customerCode");
const resultEl = document.getElementById("result");
const errorEl = document.getElementById("error");

const params = new URLSearchParams(window.location.search);
if (params.get("customer")) customerCodeEl.value = params.get("customer");

async function loadTypes() {
  const { siteTypes } = await fetch("/api/deployment-kit/sites/types").then((r) => r.json());
  siteTypeEl.innerHTML = siteTypes
    .map((t) => `<option value="${t.id}">${t.label}</option>`)
    .join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  resultEl.style.display = "none";
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  try {
    const res = await apiPost("/api/deployment-kit/sites/wizard", body);
    resultEl.style.display = "block";
    resultEl.innerHTML = `
      <p><strong>現場作成完了</strong> — ${res.siteTypeLabel}</p>
      <p>現場ID: <code>${res.site.id}</code></p>
      <p>ゾーン: ${res.zones.length} · テンプレ設備: ${res.devices.length}</p>
      <p><a href="/device/provision?customer=${res.customerCode}&site=${res.site.id}">設備登録へ</a></p>`;
  } catch (err) {
    errorEl.textContent = String(err.message ?? err);
  }
});

loadTypes().catch(console.error);

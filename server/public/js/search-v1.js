import {
  customerCodeFromPath,
  getCustomerToken,
  requireCustomerLogin,
} from "./customer-auth.js";
import { initPracticalNav } from "./tisly-practical-nav.js";

const API = "/api/search/v1";
const KIND_LABEL = {
  estimate: "見積",
  invoice: "請求",
  customer: "顧客",
  project: "案件",
  survey: "現調",
};

const $ = (id) => document.getElementById(id);
let debounceTimer = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function search(q) {
  const token = getCustomerToken();
  const res = await fetch(`${API}/?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.hits || [];
}

function renderHits(hits) {
  if (!hits.length) {
    $("search-results").innerHTML = "<p>該当なし</p>";
    return;
  }
  $("search-results").innerHTML = hits
    .map(
      (h) => `<a class="friendly-card search-hit" href="${escapeHtml(h.href)}">
        <span class="search-kind">${escapeHtml(KIND_LABEL[h.kind] || h.kind)}</span>
        <strong>${escapeHtml(h.title)}</strong>
        <p class="section-hint">${escapeHtml(h.subtitle)}</p>
      </a>`
    )
    .join("");
}

async function init() {
  await requireCustomerLogin(customerCodeFromPath());
  initPracticalNav({ appId: "projects_v1", appName: "検索", theme: "hub" });

  $("search-input").addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = $("search-input").value.trim();
      if (!q) {
        $("search-results").innerHTML = "キーワードを入力してください";
        return;
      }
      $("search-results").textContent = "検索中…";
      try {
        renderHits(await search(q));
      } catch (e) {
        $("search-results").innerHTML = `<p class="error-friendly">${escapeHtml(e.message)}</p>`;
      }
    }, 300);
  });
}

init().catch(console.error);

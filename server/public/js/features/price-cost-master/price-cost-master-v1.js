/**
 * 価格・原価マスター PWA
 * 3タブ + 検索 + カテゴリ絞り込み。
 * 既存見積マスターは参照しない。
 */

const TOKEN_KEY = "tisly_token";
const THEME_KEY = "tisly_pcm_theme_v1";
const API_PATH = "/api/price-cost-master/v1/catalog";

const state = {
  tab: "parts",
  q: "",
  category: "",
  catalog: null,
};

function authHeaders() {
  const token =
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function yen(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

function rateLabel(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return "—";
  return `${Number(rate).toFixed(1)}%`;
}

function profitClass(rate) {
  if (rate == null) return "is-warn";
  if (rate >= 50) return "is-profit";
  if (rate >= 30) return "is-warn";
  return "is-low";
}

function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = next;
  const btn = document.getElementById("pcm-theme-toggle");
  if (btn) {
    btn.textContent = next === "dark" ? "ライト" : "ダーク";
    btn.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      next === "dark" ? "#0F172A" : "#FFFFFF"
    );
  }
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "light" ? "light" : "dark");
}

function toggleTheme() {
  const next =
    document.body.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function setStatus(text) {
  const el = document.getElementById("pcm-status");
  if (el) el.textContent = text;
}

function renderChips(categories) {
  const wrap = document.getElementById("pcm-chips");
  if (!wrap) return;
  const all = ["すべて", ...categories];
  wrap.innerHTML = all
    .map((label) => {
      const value = label === "すべて" ? "" : label;
      const active =
        value === state.category ? " is-active" : "";
      return `<button type="button" class="pcm-chip${active}"
        data-category="${value}">${label}</button>`;
    })
    .join("");
}

function renderSummary(summary) {
  const el = document.getElementById("pcm-summary");
  if (!el || !summary) return;
  el.innerHTML = `
    <div><dt>件数</dt><dd>${summary.count}件</dd></div>
    <div><dt>仕入合計</dt><dd>${yen(summary.totalCost)}</dd></div>
    <div><dt>売価合計</dt><dd>${yen(summary.totalSell)}</dd></div>
    <div><dt>平均粗利率</dt>
      <dd>${rateLabel(summary.avgProfitRate)}</dd></div>
  `;
}

function metricHtml(label, value, extraClass = "") {
  return `<div class="pcm-metric ${extraClass}">
    <span>${label}</span><strong>${value}</strong>
  </div>`;
}

function renderCards(items) {
  const list = document.getElementById("pcm-list");
  if (!list) return;
  if (!items.length) {
    list.innerHTML =
      '<p class="pcm-empty">該当する項目がありません</p>';
    return;
  }
  list.innerHTML = items
    .map((item) => {
      const costLabel =
        item.kind === "subscription" ? "仕入原価（月）" : "仕入原価";
      const sellLabel =
        item.kind === "subscription"
          ? "販売価格（月額）"
          : item.kind === "labor"
            ? "販売価格（標準）"
            : "販売価格";
      const profitText =
        item.profitAmount == null
          ? "—"
          : `${yen(item.profitAmount)} / ${rateLabel(item.profitRate)}`;
      return `<article class="pcm-card" data-id="${item.id}">
        <div class="pcm-card-kicker">${item.category} · ${item.unitLabel}</div>
        <h2>${item.name}</h2>
        <div class="pcm-metrics">
          ${metricHtml(costLabel, yen(item.costPrice))}
          ${metricHtml(sellLabel, yen(item.sellPrice), "is-sell")}
          ${metricHtml(
            "粗利額 / 粗利率",
            profitText,
            profitClass(item.profitRate)
          )}
        </div>
        ${item.notes ? `<p class="pcm-notes">${item.notes}</p>` : ""}
      </article>`;
    })
    .join("");
}

function syncTabs() {
  document.querySelectorAll(".pcm-tab").forEach((btn) => {
    const on = btn.dataset.tab === state.tab;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

async function loadCatalog() {
  setStatus("読み込み中…");
  const params = new URLSearchParams();
  params.set("tab", state.tab);
  if (state.q) params.set("q", state.q);
  if (state.category) params.set("category", state.category);
  const res = await fetch(`${API_PATH}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
  if (res.status === 401) {
    setStatus("ログインが必要です。App Hub から入り直してください。");
    document.getElementById("pcm-list").innerHTML =
      '<p class="pcm-empty">社内ログイン後に価格を表示します</p>';
    return;
  }
  if (!res.ok) {
    setStatus("マスターの取得に失敗しました");
    return;
  }
  const body = await res.json();
  state.catalog = body;
  renderChips(body.categories || []);
  renderSummary(body.summary);
  renderCards(body.items || []);
  setStatus(`${body.summary?.count ?? 0}件を表示`);
}

function bind() {
  document.querySelectorAll(".pcm-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      state.category = "";
      syncTabs();
      loadCatalog();
    });
  });
  const search = document.getElementById("pcm-search");
  let timer = 0;
  search?.addEventListener("input", () => {
    state.q = search.value;
    window.clearTimeout(timer);
    timer = window.setTimeout(loadCatalog, 180);
  });
  document.getElementById("pcm-chips")?.addEventListener(
    "click",
    (ev) => {
      const btn = ev.target.closest("[data-category]");
      if (!btn) return;
      state.category = btn.dataset.category || "";
      loadCatalog();
    }
  );
  document
    .getElementById("pcm-theme-toggle")
    ?.addEventListener("click", toggleTheme);
}

loadTheme();
bind();
syncTabs();
loadCatalog();

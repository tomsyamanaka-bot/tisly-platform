/**
 * 価格・原価マスター PWA
 * 3タブ + 8ジャンル絞り込み + 追加/編集。
 * 既存見積マスターは参照しない。
 */

const TOKEN_KEY = "tisly_token";
const THEME_KEY = "tisly_pcm_theme_v1";
const API_PATH = "/api/price-cost-master/v1/catalog";
const ITEMS_PATH = "/api/price-cost-master/v1/items";

const UNIFIED_GENRES = [
  "電気工事",
  "防犯カメラ",
  "ネットワーク",
  "TV工事",
  "エアコン",
  "空調",
  "音響",
  "IOT関連",
];

const state = {
  tab: "parts",
  q: "",
  genre: "",
  catalog: null,
  formGenre: UNIFIED_GENRES[0],
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

function genreList() {
  const fromApi = state.catalog?.genres;
  if (Array.isArray(fromApi) && fromApi.length) return fromApi;
  return UNIFIED_GENRES;
}

function renderChips(genres) {
  const wrap = document.getElementById("pcm-chips");
  if (!wrap) return;
  const all = ["すべて", ...(genres.length ? genres : UNIFIED_GENRES)];
  wrap.innerHTML = all
    .map((label) => {
      const value = label === "すべて" ? "" : label;
      const active = value === state.genre ? " is-active" : "";
      return `<button type="button" class="pcm-chip${active}"
        data-genre="${value}">${label}</button>`;
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
      const genreLabel = item.genre || item.category;
      return `<article class="pcm-card" data-id="${item.id}"
        tabindex="0" role="button">
        <div class="pcm-card-kicker">${genreLabel} · ${item.unitLabel}</div>
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

function syncAddButton() {
  const btn = document.getElementById("pcm-add-btn");
  if (!btn) return;
  const canAdd = state.tab === "parts" || state.tab === "labor";
  btn.hidden = !canAdd;
  btn.disabled = !canAdd;
}

function renderGenrePills(selected) {
  const wrap = document.getElementById("pcm-genre-pills");
  if (!wrap) return;
  wrap.innerHTML = UNIFIED_GENRES.map((label) => {
    const active = label === selected ? " is-active" : "";
    return `<button type="button" class="pcm-chip${active}"
      data-form-genre="${label}">${label}</button>`;
  }).join("");
}

function openDialog(item) {
  const dialog = document.getElementById("pcm-dialog");
  const title = document.getElementById("pcm-dialog-title");
  const err = document.getElementById("pcm-dialog-error");
  if (!dialog || !title) return;
  err.textContent = "";
  document.getElementById("pcm-edit-id").value = item?.id || "";
  document.getElementById("pcm-field-name").value = item?.name || "";
  document.getElementById("pcm-field-cost").value =
    item?.costPrice != null ? item.costPrice : "";
  document.getElementById("pcm-field-sell").value =
    item?.sellPrice != null ? item.sellPrice : "";
  document.getElementById("pcm-field-unit").value =
    item?.unitLabel || (state.tab === "labor" ? "式" : "台");
  document.getElementById("pcm-field-notes").value = item?.notes || "";
  state.formGenre =
    item?.genre || state.genre || UNIFIED_GENRES[0];
  renderGenrePills(state.formGenre);
  title.textContent = item ? "項目を編集" : "項目を追加";
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function closeDialog() {
  const dialog = document.getElementById("pcm-dialog");
  if (dialog?.open) dialog.close();
}

async function loadCatalog() {
  setStatus("読み込み中…");
  const params = new URLSearchParams();
  params.set("tab", state.tab);
  if (state.q) params.set("q", state.q);
  if (state.genre) params.set("genre", state.genre);
  const res = await fetch(`${API_PATH}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
  if (res.status === 401) {
    setStatus("ログインが必要です。App Hub から入り直してください。");
    renderChips(UNIFIED_GENRES);
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
  renderChips(body.genres || UNIFIED_GENRES);
  renderSummary(body.summary);
  renderCards(body.items || []);
  syncAddButton();
  setStatus(`${body.summary?.count ?? 0}件を表示`);
}

async function saveItem(event) {
  event.preventDefault();
  const err = document.getElementById("pcm-dialog-error");
  const id = document.getElementById("pcm-edit-id").value.trim();
  const name = document.getElementById("pcm-field-name").value.trim();
  const sell = Number(document.getElementById("pcm-field-sell").value);
  const costRaw = document.getElementById("pcm-field-cost").value;
  const payload = {
    kind: state.tab,
    name,
    genre: state.formGenre,
    category: state.formGenre,
    sellPrice: sell,
    costPrice: costRaw === "" ? null : Number(costRaw),
    unitLabel: document.getElementById("pcm-field-unit").value.trim() || "式",
    notes: document.getElementById("pcm-field-notes").value.trim(),
    tags: [state.formGenre],
  };
  if (!name) {
    err.textContent = "品名を入力してください";
    return;
  }
  if (!Number.isFinite(sell)) {
    err.textContent = "販売価格を入力してください";
    return;
  }
  const url = id ? `${ITEMS_PATH}/${encodeURIComponent(id)}` : ITEMS_PATH;
  const res = await fetch(url, {
    method: id ? "PATCH" : "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    err.textContent = body.error || "保存に失敗しました";
    return;
  }
  closeDialog();
  await loadCatalog();
}

function bind() {
  document.querySelectorAll(".pcm-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      state.genre = "";
      syncTabs();
      syncAddButton();
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
      const btn = ev.target.closest("[data-genre]");
      if (!btn) return;
      state.genre = btn.dataset.genre || "";
      loadCatalog();
    }
  );
  document
    .getElementById("pcm-theme-toggle")
    ?.addEventListener("click", toggleTheme);
  document.getElementById("pcm-add-btn")?.addEventListener(
    "click",
    () => openDialog(null)
  );
  document.getElementById("pcm-dialog-cancel")?.addEventListener(
    "click",
    closeDialog
  );
  document.getElementById("pcm-form")?.addEventListener(
    "submit",
    (ev) => {
      void saveItem(ev);
    }
  );
  document.getElementById("pcm-genre-pills")?.addEventListener(
    "click",
    (ev) => {
      const btn = ev.target.closest("[data-form-genre]");
      if (!btn) return;
      state.formGenre = btn.dataset.formGenre;
      renderGenrePills(state.formGenre);
    }
  );
  document.getElementById("pcm-list")?.addEventListener(
    "click",
    (ev) => {
      const card = ev.target.closest(".pcm-card");
      if (!card) return;
      const item = (state.catalog?.items || []).find(
        (row) => row.id === card.dataset.id
      );
      if (item && (item.kind === "parts" || item.kind === "labor")) {
        openDialog(item);
      }
    }
  );
}

loadTheme();
bind();
syncTabs();
syncAddButton();
loadCatalog();

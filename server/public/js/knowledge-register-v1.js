import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin } from "./customer-auth.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}

async function api(path, opts = {}) {
  const token =
    localStorage.getItem("tisly_admin_token") || sessionStorage.getItem("tisly_token") || "";
  const res = await fetch(`/api/knowledge${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function parseTags(raw) {
  return String(raw ?? "")
    .split(/[,、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseFiles(raw) {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);
}

function renderHits(hits) {
  const el = $("search-results");
  if (!el) return;
  if (!hits?.length) {
    el.innerHTML = '<p class="status-muted">該当なし</p>';
    return;
  }
  el.innerHTML = `<div class="hit-list">${hits
    .map(
      (h) => `
    <article class="hit-item">
      <h3>${escapeHtml(h.title)}</h3>
      <div class="hit-meta">${escapeHtml(h.category)} · ${escapeHtml(h.id)} · ${escapeHtml(h.updatedAt)}</div>
      <div>${(h.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>
      <p class="hit-summary">${escapeHtml(h.summary)}</p>
    </article>`
    )
    .join("")}</div>`;
}

function renderCardList(cards) {
  const list = $("card-list");
  const count = $("card-count");
  if (count) count.textContent = `${cards.length} 件`;
  if (!list) return;
  if (!cards.length) {
    list.innerHTML = '<p class="status-muted">まだ登録がありません</p>';
    return;
  }
  list.innerHTML = cards
    .map(
      (c) => `
    <div class="card-list-item">
      <span><strong>${escapeHtml(c.title)}</strong><br><span class="status-muted">${escapeHtml(c.category)} · ${escapeHtml(c.id)}</span></span>
      <button type="button" class="friendly-btn" data-fill="${escapeAttr(c.id)}">編集</button>
    </div>`
    )
    .join("");
  list.querySelectorAll("[data-fill]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-fill");
      try {
        const { card } = await api(`/cards/${encodeURIComponent(id)}`);
        fillForm(card);
        toast(`${card.id} をフォームに読み込みました`);
      } catch (e) {
        toast(e.message || "読み込み失敗");
      }
    });
  });
}

function fillForm(card) {
  if ($("card-id")) $("card-id").value = card.id || "";
  if ($("card-title")) $("card-title").value = card.title || "";
  if ($("card-category")) $("card-category").value = card.category || "";
  if ($("card-tags")) $("card-tags").value = (card.tags || []).join(", ");
  if ($("card-summary")) $("card-summary").value = card.summary || "";
  if ($("card-files")) $("card-files").value = (card.files || []).join("\n");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

async function loadCategories() {
  const data = await api("/categories");
  const sel = $("card-category");
  if (!sel) return;
  sel.innerHTML = (data.categories || [])
    .map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`)
    .join("");
}

async function loadCards() {
  const data = await api("/cards");
  renderCardList(data.cards || []);
}

async function runSearch() {
  const q = $("search-input")?.value?.trim() ?? "";
  if (!q) {
    $("search-results").innerHTML = '<p class="status-muted">キーワードを入力してください</p>';
    return;
  }
  try {
    const data = await api(`/search?q=${encodeURIComponent(q)}`);
    renderHits(data.hits || []);
  } catch (e) {
    toast(e.message || "検索失敗");
  }
}

async function init() {
  await requireCustomerLogin();
  initPracticalNav({ title: "ナレッジ", active: "settings" });

  await loadCategories();
  await loadCards();

  $("search-btn")?.addEventListener("click", runSearch);
  $("search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });

  $("form-reset")?.addEventListener("click", () => {
    $("card-form")?.reset();
  });

  $("card-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      id: $("card-id")?.value?.trim(),
      title: $("card-title")?.value?.trim(),
      category: $("card-category")?.value,
      tags: parseTags($("card-tags")?.value),
      summary: $("card-summary")?.value?.trim(),
      files: parseFiles($("card-files")?.value),
    };
    try {
      const { card } = await api("/cards", { method: "POST", body: JSON.stringify(body) });
      toast(`✅ 保存: ${card.id}`);
      await loadCards();
      await runSearch();
    } catch (err) {
      toast(err.message || "保存失敗");
    }
  });
}

init().catch((e) => {
  console.error(e);
  toast(e.message || "初期化失敗");
});

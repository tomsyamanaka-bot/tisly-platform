import { initPracticalNav } from "./tisly-practical-nav.js";

const tokenKey = "tisly_customer_token";

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

async function api(path, opts = {}) {
  const token = localStorage.getItem(tokenKey);
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

let currentStatus = "";
let filterProjectNo = "";
let filterCategory = "";
let labels = { stage: {}, source: {} };
let allCandidates = [];
const selectedIds = new Set();

function renderStats(stats) {
  document.getElementById("stat-pending").textContent = String(stats.pending ?? 0);
  document.getElementById("stat-approved").textContent = String(stats.approved ?? 0);
  document.getElementById("stat-rejected").textContent = String(stats.rejected ?? 0);
}

function renderCategoryFilter(categories) {
  const sel = document.getElementById("filter-category");
  const current = sel.value;
  sel.innerHTML = '<option value="">カテゴリ（すべて）</option>';
  for (const cat of categories || []) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function updateBulkBar() {
  const pendingSelected = [...selectedIds].filter((id) => {
    const c = allCandidates.find((x) => x.id === id);
    return c?.status === "pending";
  });
  document.getElementById("selected-count").textContent = `${pendingSelected.length}件選択`;
  const disabled = pendingSelected.length === 0;
  document.getElementById("bulk-approve").disabled = disabled;
  document.getElementById("bulk-reject").disabled = disabled;
}

function renderCandidates(candidates) {
  allCandidates = candidates;
  const mount = document.getElementById("candidate-list");
  if (!candidates.length) {
    mount.innerHTML = '<p class="status-muted">候補がありません</p>';
    updateBulkBar();
    return;
  }
  mount.innerHTML = candidates
    .map((c) => {
      const stageLabel = c.stage ? labels.stage[c.stage] || c.stage : "";
      const sourceLabel = labels.source[c.source] || c.source;
      const tags = (c.tags || [])
        .slice(0, 8)
        .map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`)
        .join("");
      const checked = selectedIds.has(c.id) ? "checked" : "";
      const checkbox =
        c.status === "pending"
          ? `<input type="checkbox" class="candidate-check" data-select="${c.id}" ${checked} />`
          : `<span style="width:1.1rem;display:inline-block;"></span>`;
      const actions =
        c.status === "pending"
          ? `<div class="candidate-actions">
              <button type="button" class="friendly-btn primary" data-approve="${c.id}">承認して登録</button>
              <button type="button" class="friendly-btn" data-reject="${c.id}">却下</button>
            </div>`
          : c.approvedCardId
            ? `<p class="candidate-meta">登録カード: ${escapeHtml(c.approvedCardId)}</p>`
            : "";
      return `<article class="candidate-item status-${c.status}">
        ${checkbox}
        <div>
          <h3>${escapeHtml(c.title)}</h3>
          <p class="candidate-meta">${escapeHtml(sourceLabel)}${stageLabel ? " · " + escapeHtml(stageLabel) : ""} · ${escapeHtml(c.projectNo || "—")} · ${escapeHtml(c.category || "")}</p>
          <p class="candidate-summary">${escapeHtml(c.summary)}</p>
          <div>${tags}</div>
          ${actions}
        </div>
      </article>`;
    })
    .join("");
  updateBulkBar();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadCandidates() {
  const params = new URLSearchParams();
  if (currentStatus) params.set("status", currentStatus);
  if (filterProjectNo.trim()) params.set("projectNo", filterProjectNo.trim());
  if (filterCategory) params.set("category", filterCategory);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await api(`/api/knowledge/candidates${qs}`);
  labels = data.labels || labels;
  renderStats(data.stats || {});
  renderCategoryFilter(data.categories || []);
  renderCandidates(data.candidates || []);
}

document.querySelectorAll(".filter-row button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-row button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status || "";
    selectedIds.clear();
    document.getElementById("select-all").checked = false;
    loadCandidates().catch((e) => toast(e.message));
  });
});

document.getElementById("filter-project-no").addEventListener(
  "input",
  debounce(() => {
    filterProjectNo = document.getElementById("filter-project-no").value;
    selectedIds.clear();
    loadCandidates().catch((e) => toast(e.message));
  }, 350)
);

document.getElementById("filter-category").addEventListener("change", () => {
  filterCategory = document.getElementById("filter-category").value;
  selectedIds.clear();
  loadCandidates().catch((e) => toast(e.message));
});

document.getElementById("select-all").addEventListener("change", (ev) => {
  const checked = ev.target.checked;
  selectedIds.clear();
  if (checked) {
    for (const c of allCandidates) {
      if (c.status === "pending") selectedIds.add(c.id);
    }
  }
  document.querySelectorAll("[data-select]").forEach((el) => {
    if (el.dataset.select) el.checked = checked && allCandidates.find((c) => c.id === el.dataset.select)?.status === "pending";
  });
  updateBulkBar();
});

document.getElementById("candidate-list").addEventListener("change", (ev) => {
  const id = ev.target.dataset?.select;
  if (!id) return;
  if (ev.target.checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkBar();
});

document.getElementById("candidate-list").addEventListener("click", async (ev) => {
  const approveId = ev.target.closest("[data-approve]")?.dataset.approve;
  const rejectId = ev.target.closest("[data-reject]")?.dataset.reject;
  if (approveId) {
    try {
      const res = await api(`/api/knowledge/candidates/${approveId}/approve`, { method: "POST" });
      toast(`登録: ${res.card?.id || approveId}`);
      selectedIds.delete(approveId);
      await loadCandidates();
    } catch (e) {
      toast(e.message);
    }
  }
  if (rejectId) {
    try {
      await api(`/api/knowledge/candidates/${rejectId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "手動却下" }),
      });
      toast("却下しました");
      selectedIds.delete(rejectId);
      await loadCandidates();
    } catch (e) {
      toast(e.message);
    }
  }
});

document.getElementById("bulk-approve").addEventListener("click", async () => {
  const ids = [...selectedIds].filter((id) => allCandidates.find((c) => c.id === id && c.status === "pending"));
  if (!ids.length) return;
  try {
    const res = await api("/api/knowledge/candidates/bulk/approve", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    toast(`承認 ${res.approved?.length ?? 0}件 · エラー ${res.errors?.length ?? 0}件`);
    selectedIds.clear();
    document.getElementById("select-all").checked = false;
    await loadCandidates();
  } catch (e) {
    toast(e.message);
  }
});

document.getElementById("bulk-reject").addEventListener("click", async () => {
  const ids = [...selectedIds].filter((id) => allCandidates.find((c) => c.id === id && c.status === "pending"));
  if (!ids.length) return;
  if (!confirm(`${ids.length}件を却下しますか？`)) return;
  try {
    const res = await api("/api/knowledge/candidates/bulk/reject", {
      method: "POST",
      body: JSON.stringify({ ids, reason: "一括却下" }),
    });
    toast(`却下 ${res.rejected?.length ?? 0}件`);
    selectedIds.clear();
    document.getElementById("select-all").checked = false;
    await loadCandidates();
  } catch (e) {
    toast(e.message);
  }
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

initPracticalNav({ title: "ナレッジ候補", active: "settings" });
loadCandidates().catch((e) => {
  document.getElementById("candidate-list").innerHTML = `<p class="status-muted">${escapeHtml(e.message)}</p>`;
});

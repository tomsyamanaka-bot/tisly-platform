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
let labels = { stage: {}, source: {} };

function renderStats(stats) {
  document.getElementById("stat-pending").textContent = String(stats.pending ?? 0);
  document.getElementById("stat-approved").textContent = String(stats.approved ?? 0);
  document.getElementById("stat-rejected").textContent = String(stats.rejected ?? 0);
}

function renderCandidates(candidates) {
  const mount = document.getElementById("candidate-list");
  if (!candidates.length) {
    mount.innerHTML = '<p class="status-muted">候補がありません</p>';
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
        <h3>${escapeHtml(c.title)}</h3>
        <p class="candidate-meta">${escapeHtml(sourceLabel)}${stageLabel ? " · " + escapeHtml(stageLabel) : ""} · ${escapeHtml(c.projectNo || "—")}</p>
        <p class="candidate-summary">${escapeHtml(c.summary)}</p>
        <div>${tags}</div>
        ${actions}
      </article>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadCandidates() {
  const qs = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : "";
  const data = await api(`/api/knowledge/candidates${qs}`);
  labels = data.labels || labels;
  renderStats(data.stats || {});
  renderCandidates(data.candidates || []);
}

document.querySelectorAll(".filter-row button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-row button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status || "";
    loadCandidates().catch((e) => toast(e.message));
  });
});

document.getElementById("candidate-list").addEventListener("click", async (ev) => {
  const approveId = ev.target.closest("[data-approve]")?.dataset.approve;
  const rejectId = ev.target.closest("[data-reject]")?.dataset.reject;
  if (approveId) {
    try {
      const res = await api(`/api/knowledge/candidates/${approveId}/approve`, { method: "POST" });
      toast(`登録: ${res.card?.id || approveId}`);
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
      await loadCandidates();
    } catch (e) {
      toast(e.message);
    }
  }
});

initPracticalNav({ title: "ナレッジ候補", active: "settings" });
loadCandidates().catch((e) => {
  document.getElementById("candidate-list").innerHTML = `<p class="status-muted">${escapeHtml(e.message)}</p>`;
});

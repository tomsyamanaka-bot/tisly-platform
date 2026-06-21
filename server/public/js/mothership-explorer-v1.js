import { initPracticalNav } from "./tisly-practical-nav.js";

const tokenKey = "tisly_customer_token";

async function api(path) {
  const token = localStorage.getItem(tokenKey);
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderNode(node, depth = 0) {
  const hasChildren = node.children?.length;
  const kind = node.kind || "folder";
  const kt = node.meta?.knowledgeTarget ? " · Knowledge" : "";
  if (!hasChildren) {
    return `<div class="tree-node" data-kind="${kind}" data-path="${escapeHtml(node.path)}" style="margin-left:${depth * 0.75}rem">
      <button type="button" class="friendly-btn" style="font-size:0.82rem;padding:0.2rem 0.35rem;" data-select="${escapeHtml(node.path)}" data-name="${escapeHtml(node.name)}" data-meta='${escapeHtml(JSON.stringify(node.meta || {}))}'>
        ${escapeHtml(node.name)}${node.count != null ? ` (${node.count})` : ""}${kt}
      </button>
    </div>`;
  }
  return `<details class="tree-node" data-kind="${kind}" open="${depth < 1}">
    <summary data-select="${escapeHtml(node.path)}" data-name="${escapeHtml(node.name)}" data-meta='${escapeHtml(JSON.stringify(node.meta || {}))}'>${escapeHtml(node.name)}${node.count != null ? ` (${node.count})` : ""}${kt}</summary>
    ${node.children.map((c) => renderNode(c, depth + 1)).join("")}
  </details>`;
}

function renderSummary(summary) {
  const items = [
    ["Cards", summary.knowledgeCards],
    ["候補", summary.pendingCandidates],
    ["PLC", summary.plcAssets],
    ["3DPrint", summary.threedPrintAssets],
    ["Factory", summary.factoryAssets],
    ["案件", summary.projects],
  ];
  document.getElementById("summary-grid").innerHTML = items
    .map(
      ([label, val]) =>
        `<div><strong>${escapeHtml(String(val ?? 0))}</strong>${escapeHtml(label)}</div>`
    )
    .join("");
}

function renderStatusBar(connection, syncStatus) {
  const connClass = connection?.connected ? "ok" : "warn";
  const pending = syncStatus?.pending ?? 0;
  const failed = syncStatus?.failed ?? 0;
  document.getElementById("status-bar").innerHTML = `
    <span class="status-pill ${connClass}">QNAP: ${escapeHtml(connection?.mockMode ? "Mock" : connection?.connected ? "接続" : "未接続")}</span>
    <span class="status-pill ${pending > 0 ? "warn" : "ok"}">同期待ち ${pending}</span>
    <span class="status-pill ${failed > 0 ? "warn" : "ok"}">失敗 ${failed}</span>
    <span class="status-pill">Cards ${syncStatus?.byKind?.KnowledgeCards?.success ?? 0} / Candidates ${syncStatus?.byKind?.Candidates?.success ?? 0}</span>
  `;
}

function renderTopFolders(folders) {
  document.getElementById("top-folder-grid").innerHTML = (folders || [])
    .map((f) => {
      const cls = f.knowledgeTarget ? "knowledge" : "other";
      const count = f.count != null ? ` (${f.count})` : "";
      const tag = f.knowledgeTarget ? "Knowledge" : "保管";
      return `<div class="${cls}"><strong>${escapeHtml(f.name)}${count}</strong><br>${escapeHtml(tag)}</div>`;
    })
    .join("");
}

function renderRecent(updates) {
  const el = document.getElementById("recent-list");
  if (!updates?.length) {
    el.innerHTML = '<p class="status-muted">更新なし</p>';
    return;
  }
  el.innerHTML = updates
    .map(
      (u) => `<div class="recent-item">
        <strong>${escapeHtml(u.label)}</strong>
        <div class="path-text">${escapeHtml(u.path)} · ${escapeHtml(u.kind)} · ${escapeHtml(String(u.updatedAt).slice(0, 10))}</div>
      </div>`
    )
    .join("");
}

function showDetail(path, name, metaJson) {
  let meta = {};
  try {
    meta = JSON.parse(metaJson || "{}");
  } catch {
    /* */
  }
  const kt = meta.knowledgeTarget ? "Knowledge対象" : "Knowledge非対象";
  document.getElementById("detail-pane").innerHTML = `
    <p><strong>${escapeHtml(name || path)}</strong></p>
    <p class="path-text">${escapeHtml(path)}</p>
    <p class="status-muted">${escapeHtml(kt)}${meta.pending != null ? ` · 承認待ち ${meta.pending}` : ""}</p>
  `;
}

async function loadExplorer() {
  const data = await api("/api/knowledge/mothership/explorer");
  document.getElementById("unc-path").textContent = data.unc || "\\\\192.168.1.10\\TiSLY";
  renderSummary(data.summary || {});
  renderStatusBar(data.connection, data.syncStatus);
  renderTopFolders(data.topFolders);
  renderRecent(data.recentUpdates);
  document.getElementById("tree-root").innerHTML = (data.roots || [])
    .map((r) => renderNode(r))
    .join("");
}

async function runSearch() {
  const q = document.getElementById("search-input").value.trim();
  if (!q) {
    document.getElementById("search-hits").innerHTML = "";
    return;
  }
  const data = await api(`/api/knowledge/mothership/search?q=${encodeURIComponent(q)}`);
  const hits = data.hits || [];
  document.getElementById("search-hits").innerHTML = hits.length
    ? hits
        .map(
          (h) => `<div class="hit-item">
            <strong>${escapeHtml(h.name)}</strong>
            <div class="path-text">${escapeHtml(h.path)}</div>
          </div>`
        )
        .join("")
    : '<p class="status-muted">一致なし</p>';
}

document.getElementById("search-btn").addEventListener("click", () => {
  runSearch().catch((e) => {
    document.getElementById("search-hits").innerHTML = `<p class="status-muted">${escapeHtml(e.message)}</p>`;
  });
});

document.getElementById("tree-root").addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-select]");
  if (!el) return;
  showDetail(el.dataset.select, el.dataset.name || el.textContent?.trim(), el.dataset.meta);
});

initPracticalNav({ title: "MotherShip", active: "settings" });
loadExplorer().catch((e) => {
  document.getElementById("tree-root").innerHTML = `<p class="status-muted">${escapeHtml(e.message)}</p>`;
});

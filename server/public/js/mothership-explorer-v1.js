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
  if (!hasChildren) {
    return `<div class="tree-node" data-kind="${kind}" data-path="${escapeHtml(node.path)}" style="margin-left:${depth * 0.75}rem">
      <button type="button" class="friendly-btn" style="font-size:0.82rem;padding:0.2rem 0.35rem;" data-select="${escapeHtml(node.path)}">
        ${escapeHtml(node.name)}${node.count != null ? ` (${node.count})` : ""}
      </button>
    </div>`;
  }
  return `<details class="tree-node" data-kind="${kind}" open="${depth < 1}">
    <summary data-select="${escapeHtml(node.path)}">${escapeHtml(node.name)}${node.count != null ? ` (${node.count})` : ""}</summary>
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

function showDetail(path, name) {
  document.getElementById("detail-pane").innerHTML = `
    <p><strong>${escapeHtml(name || path)}</strong></p>
    <p class="path-text">${escapeHtml(path)}</p>
    <p class="status-muted">MotherShip 上の相対パス（ローカルミラーと QNAP を横断参照）</p>
  `;
}

async function loadExplorer() {
  const data = await api("/api/knowledge/mothership/explorer");
  document.getElementById("unc-path").textContent = data.unc || "\\\\192.168.1.10\\TiSLY";
  renderSummary(data.summary || {});
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
  const path = ev.target.closest("[data-select]")?.dataset.select;
  if (!path) return;
  const name = ev.target.textContent?.trim() || path;
  showDetail(path, name);
});

initPracticalNav({ title: "MotherShip", active: "settings" });
loadExplorer().catch((e) => {
  document.getElementById("tree-root").innerHTML = `<p class="status-muted">${escapeHtml(e.message)}</p>`;
});

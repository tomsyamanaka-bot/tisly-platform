import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import { KIND_LABELS, escapeHtml } from "./knowledge-field-shared-v1.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function section(title, content, empty = "—") {
  const body = content || `<span class="empty-hint">${empty}</span>`;
  return `<div class="detail-section"><h2>${escapeHtml(title)}</h2>${body}</div>`;
}

function renderDetail(d) {
  const kindLabel = KIND_LABELS[d.kind] || d.kind;
  const tags = (d.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
  const files = (d.files || []).length
    ? `<ul>${d.files.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
    : "";
  const materials = (d.materials || []).length
    ? `<ul>${d.materials.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
    : "";
  const tools = (d.tools || []).length
    ? `<ul>${d.tools.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : "";
  const related = (d.relatedKnowledge || []).length
    ? `<div class="related-list">${d.relatedKnowledge
        .map(
          (r) =>
            `<a class="related-item" href="/knowledge-detail-v1?id=${encodeURIComponent(r.id)}&kind=${encodeURIComponent(r.kind)}">${escapeHtml(r.title)}<small>${escapeHtml(r.category)}</small></a>`
        )
        .join("")}</div>`
    : "";

  const flags = [];
  if (d.hasPhoto) flags.push('<span class="flag-badge">📷 写真あり</span>');
  if (d.hasPdf) flags.push('<span class="flag-badge">📄 PDFあり</span>');
  if (d.hasPlc) flags.push('<span class="flag-badge">⚙ PLCあり</span>');
  if (d.has3dPrint) flags.push('<span class="flag-badge">🖨 3DPrintあり</span>');

  const actions = [];
  if (d.openUrl) {
    actions.push(`<a class="primary" href="${escapeHtml(d.openUrl)}">開く</a>`);
  }
  actions.push(`<a href="/knowledge-field-v1?q=${encodeURIComponent(d.title)}">現場検索へ</a>`);
  if (d.qnapPath) {
    actions.push(
      `<button type="button" id="qnap-btn">QNAP場所を表示</button>`
    );
  }
  if (d.hasPlc || d.kind === "esp") {
    actions.push(`<a href="#template" id="template-link">テンプレを見る</a>`);
  }

  return `
    <div class="friendly-card">
      <h1 class="detail-title">${escapeHtml(d.title)}</h1>
      <p class="detail-meta">${escapeHtml(kindLabel)} · ${escapeHtml(d.category || "—")} · ${escapeHtml(d.createdAt || "")}</p>
      <div class="flag-row">${flags.join("")}</div>
      ${section("概要", `<p>${escapeHtml(d.summary || "—")}</p>`)}
      ${section("カテゴリ", `<p>${escapeHtml(d.category || "—")}</p>`)}
      ${section("タグ", tags ? `<div class="tag-row">${tags}</div>` : "")}
      ${section("案件ID", `<p>${escapeHtml(d.projectNo || "—")}</p>`)}
      ${section("関連ファイル", files)}
      ${section("QNAP保存場所", `<p id="qnap-path">${escapeHtml(d.qnapPath || "—")}</p>`)}
      ${section("注意点", d.cautions ? `<p>${escapeHtml(d.cautions)}</p>` : "")}
      ${section("手順", d.procedure ? `<p>${escapeHtml(d.procedure)}</p>` : "")}
      ${d.ladderDescription ? section("ラダー", `<p id="template">${escapeHtml(d.ladderDescription)}</p>`) : ""}
      ${d.usage ? section("用途", `<p>${escapeHtml(d.usage)}</p>`) : ""}
      ${section("材料", materials)}
      ${section("工具", tools)}
      ${section("関連ナレッジ", related)}
      <div class="detail-actions">${actions.join("")}</div>
    </div>
  `;
}

async function loadDetail() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const kind = params.get("kind") || "";
  if (!id) {
    $("detail-root").innerHTML = '<p class="status-muted">ID が指定されていません</p>';
    return;
  }

  const token = getCustomerToken();
  const qs = new URLSearchParams({ id });
  if (kind) qs.set("kind", kind);
  const res = await fetch(`/api/knowledge/detail-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("detail-root").innerHTML = `<p class="status-muted">${escapeHtml(data.error || "読み込み失敗")}</p>`;
    return;
  }

  $("detail-root").innerHTML = renderDetail(data.detail);
  document.title = `TiSLY — ${data.detail.title}`;

  $("qnap-btn")?.addEventListener("click", () => {
    toast(`QNAP: \\\\192.168.1.10\\TiSLY\\${data.detail.qnapPath || ""}`);
  });

  if (location.hash === "#template") {
    document.getElementById("template")?.scrollIntoView({ behavior: "smooth" });
  }
}

async function init() {
  await requireCustomerLogin();
  initPracticalNav({ appId: "projects_v1", appName: "ナレッジ詳細", theme: "hub" });
  await loadDetail();
}

init();

import { initPracticalNav } from "./tisly-practical-nav.js";
import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import { KIND_LABELS, escapeHtml } from "./knowledge-field-shared-v1.js";
import {
  bindAttachmentCardsV3,
  logKnowledgeUsedV3,
  pushRecentKnowledgeV3,
  renderAttachmentCardV3,
  showQnapModalV3,
} from "./knowledge-field-ux-v3.js";

const $ = (id) => document.getElementById(id);
let currentDetail = null;
let lastQuery = "";

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function section(title, content, empty = "—", id) {
  const body = content || `<span class="empty-hint">${empty}</span>`;
  const idAttr = id ? ` id="${id}"` : "";
  return `<div class="detail-section"${idAttr}><h2>${escapeHtml(title)}</h2>${body}</div>`;
}

function renderAttachmentSection(items) {
  if (!items?.length) return "";
  return items.map(renderAttachmentCardV3).join("");
}

function renderProjectLinks(projects) {
  if (!projects?.length) return "";
  return `<div class="related-list">${projects
    .map(
      (p) =>
        `<a class="related-item" href="${escapeHtml(p.openUrl || `/projects-v1?projectId=${encodeURIComponent(p.projectId || "")}`)}">${escapeHtml(p.title)}<small>${escapeHtml(p.projectNo)}</small></a>`
    )
    .join("")}</div>`;
}

function renderDetail(d) {
  const kindLabel = KIND_LABELS[d.kind] || d.kind;
  const tags = (d.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
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
  if (d.qnapPath) flags.push('<span class="flag-badge">📁 QNAPあり</span>');

  const materials = (d.materials || []).length
    ? `<ul>${d.materials.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
    : "";
  const tools = (d.tools || []).length
    ? `<ul>${d.tools.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : "";

  const actions = [];
  if (d.openUrl) {
    actions.push(`<a class="primary action-open-lg" href="${escapeHtml(d.openUrl)}" target="_blank" rel="noopener">開く</a>`);
  }
  actions.push(`<a href="/knowledge-field-v1?q=${encodeURIComponent(d.title)}">現場検索へ</a>`);
  if (d.qnapPath) {
    actions.push(`<button type="button" id="qnap-btn">📁 QNAP場所</button>`);
  }
  if (d.hasPlc || d.kind === "esp") {
    actions.push(`<a href="#template" id="template-link">テンプレを見る</a>`);
  }

  const qnapSection = d.qnapLinks
    ? `<p id="qnap-path"><code>${escapeHtml(d.qnapLinks.smbPath)}</code></p>
       <button type="button" class="friendly-btn qnap-copy-options-btn" id="qnap-copy-btn" style="margin-top:0.35rem;min-height:2.75rem;width:100%;">コピー種類を選ぶ</button>`
    : `<p id="qnap-path">${escapeHtml(d.qnapPath || "—")}</p>`;

  return `
    <div class="friendly-card">
      <h1 class="detail-title">${escapeHtml(d.title)}</h1>
      <p class="detail-meta">${escapeHtml(kindLabel)} · ${escapeHtml(d.category || "—")} · ${escapeHtml(d.createdAt || "")}</p>
      <div class="flag-row">${flags.join("")}</div>
      ${section("概要", `<p>${escapeHtml(d.summary || "—")}</p>`)}
      ${section("手順", d.procedure ? `<p>${escapeHtml(d.procedure)}</p>` : "")}
      ${section("材料", materials)}
      ${section("工具", tools)}
      ${section("注意点", d.cautions ? `<p>${escapeHtml(d.cautions)}</p>` : "")}
      ${d.ladderDescription ? section("ラダー", `<p id="template">${escapeHtml(d.ladderDescription)}</p>`) : ""}
      ${d.usage ? section("用途", `<p>${escapeHtml(d.usage)}</p>`) : ""}
      ${section("関連PDF", renderAttachmentSection(d.relatedPdfs))}
      ${section("関連写真", renderAttachmentSection(d.relatedPhotos))}
      ${section("関連3DPrint", renderAttachmentSection(d.related3dPrint))}
      ${section("関連案件", renderProjectLinks(d.relatedProjects))}
      ${section("関連PLC", renderAttachmentSection(d.relatedPlc))}
      ${section("QNAP保存パス", qnapSection)}
      ${section("タグ", tags ? `<div class="tag-row">${tags}</div>` : "")}
      ${section("関連ナレッジ", related, "—", "related")}
      <div class="detail-actions">${actions.join("")}</div>
      <div class="detail-used-row">
        <button type="button" id="used-btn">✓ このナレッジを使った</button>
      </div>
    </div>
  `;
}

function bindDetailEvents(d) {
  $("qnap-btn")?.addEventListener("click", () => {
    showQnapModalV3(d.qnapPath || "", d.title, toast);
  });
  $("qnap-copy-btn")?.addEventListener("click", () => {
    showQnapModalV3(d.qnapPath || "", d.title, toast);
  });
  $("used-btn")?.addEventListener("click", () => {
    logKnowledgeUsedV3(
      {
        knowledgeId: d.id,
        kind: d.kind,
        title: d.title,
        query: lastQuery,
        projectId: d.projectId || "",
        category: d.category || "",
        source: "field-detail",
      },
      getCustomerToken()
    );
    toast("使った記録を保存しました");
  });
  bindAttachmentCardsV3($("detail-root"), toast);

  if (location.hash === "#template") {
    document.getElementById("template")?.scrollIntoView({ behavior: "smooth" });
  }
  if (location.hash === "#related") {
    document.getElementById("related")?.scrollIntoView({ behavior: "smooth" });
  }
}

async function loadDetail() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const kind = params.get("kind") || "";
  lastQuery = params.get("q") || "";
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

  currentDetail = data.detail;
  $("detail-root").innerHTML = renderDetail(data.detail);
  document.title = `TiSLY — ${data.detail.title}`;
  pushRecentKnowledgeV3({
    id: data.detail.id,
    kind: data.detail.kind,
    title: data.detail.title,
    category: data.detail.category,
  });
  bindDetailEvents(data.detail);
}

async function init() {
  await requireCustomerLogin();
  initPracticalNav({ appId: "projects_v1", appName: "ナレッジ詳細", theme: "hub" });
  await loadDetail();
}

init();

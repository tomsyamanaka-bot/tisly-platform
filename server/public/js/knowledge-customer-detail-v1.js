import { requireCustomerLogin, getCustomerToken } from "./customer-auth.js";
import { logKnowledgeUsedV3 } from "./knowledge-field-ux-v3.js";
import {
  escapeHtml,
  renderCustomerPhotoGalleryV1,
  sanitizeCustomerTextV1,
} from "./knowledge-customer-shared-v1.js";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function renderListSection(title, items, renderItem) {
  if (!items?.length) return "";
  return `<section class="customer-card">
    <h2>${escapeHtml(title)}</h2>
    ${renderItem(items)}
  </section>`;
}

function renderDetail(d) {
  const ex = d.explanation || {};
  const photosHtml = renderCustomerPhotoGalleryV1(d.photos);

  const benefits = (ex.customerBenefits || []).map((b) => `<li>${escapeHtml(sanitizeCustomerTextV1(b))}</li>`).join("");
  const warnings = (ex.customerWarnings || []).map((w) => `<li>${escapeHtml(sanitizeCustomerTextV1(w))}</li>`).join("");
  const checkpoints = (ex.afterWorkCheckpoints || [])
    .map((c) => `<li>${escapeHtml(sanitizeCustomerTextV1(c))}</li>`)
    .join("");
  const questions = (ex.relatedQuestions || [])
    .map((q) => `<span class="customer-question-chip">${escapeHtml(sanitizeCustomerTextV1(q))}</span>`)
    .join("");

  const beforeAfter = d.beforeAfter
    ? `<div class="customer-before-after">
        <div class="customer-ba-box before"><strong>${escapeHtml(d.beforeAfter.beforeLabel)}</strong><span>いまの状態</span></div>
        <div class="customer-ba-box after"><strong>${escapeHtml(d.beforeAfter.afterLabel)}</strong><span>${escapeHtml(sanitizeCustomerTextV1(d.beforeAfter.summary))}</span></div>
      </div>`
    : "";

  const pdfsHtml =
    d.pdfs?.length > 0
      ? d.pdfs
          .map(
            (pdf) =>
              `<a class="customer-pdf-btn" href="${escapeHtml(pdf.viewUrl)}" target="_blank" rel="noopener">📄 ${escapeHtml(pdf.label || "PDF資料を見る")}</a>`
          )
          .join("")
      : "";

  const partsHtml =
    d.parts3d?.length > 0
      ? d.parts3d
          .map((part) => {
            if (part.viewUrl) {
              return `<a class="customer-part-btn" href="${escapeHtml(part.viewUrl)}" target="_blank" rel="noopener">🖨 部品資料（${escapeHtml(part.fileType)}） · ${escapeHtml(part.label)}</a>`;
            }
            return `<div class="customer-part-btn">🖨 部品資料（${escapeHtml(part.fileType)}） · ${escapeHtml(part.label)}</div>`;
          })
          .join("")
      : "";

  const relatedHtml =
    d.relatedItems?.length > 0
      ? d.relatedItems
          .map(
            (r) =>
              `<a class="customer-related-item" href="${escapeHtml(r.detailUrl)}">${escapeHtml(r.title)}<small>${escapeHtml(r.category)}</small></a>`
          )
          .join("")
      : "";

  const siteHtml =
    d.siteLocations?.length > 0
      ? `<div class="customer-site-locations">${d.siteLocations
          .map((loc) => `<span class="customer-site-chip">${escapeHtml(loc.icon)} ${escapeHtml(loc.label)}</span>`)
          .join("")}</div>`
      : "";

  return `
    ${photosHtml}
    <header class="customer-detail-head">
      <h1>${escapeHtml(d.title)}</h1>
      <p class="customer-detail-headline">${escapeHtml(sanitizeCustomerTextV1(ex.headline || ex.whatIsIt || ""))}</p>
      <p class="customer-detail-category">${escapeHtml(d.category || "—")}</p>
    </header>
    ${renderListSection("わかりやすい説明", ex.simpleDescription ? [ex.simpleDescription] : [], (items) =>
      `<p>${escapeHtml(sanitizeCustomerTextV1(items[0]))}</p>`
    )}
    ${beforeAfter ? `<section class="customer-card"><h2>施工イメージ</h2>${beforeAfter}</section>` : ""}
    ${benefits ? renderListSection("工事で良くなること", ex.customerBenefits, () => `<ul>${benefits}</ul>`) : ""}
    ${warnings ? renderListSection("注意点", ex.customerWarnings, () => `<ul>${warnings}</ul>`) : ""}
    ${checkpoints ? renderListSection("施工後の確認ポイント", ex.afterWorkCheckpoints, () => `<ul>${checkpoints}</ul>`) : ""}
    ${pdfsHtml ? `<section class="customer-card"><h2>PDF資料</h2>${pdfsHtml}</section>` : ""}
    ${partsHtml ? `<section class="customer-card"><h2>部品資料</h2>${partsHtml}</section>` : ""}
    ${siteHtml ? `<section class="customer-card"><h2>この資料が関係する場所</h2>${siteHtml}</section>` : ""}
    ${relatedHtml ? `<section class="customer-card"><h2>関連資料</h2>${relatedHtml}</section>` : ""}
    ${questions ? `<section class="customer-card"><h2>よくあるご質問</h2>${questions}</section>` : ""}
    <div class="customer-field-link-row">
      <a href="${escapeHtml(d.fieldDetailUrl)}">🔧 現場向け詳細へ戻る</a>
    </div>
  `;
}

function bindDetailEvents(d) {
  const bar = $("customer-detail-bar");
  if (bar) bar.hidden = false;

  const fieldLink = $("customer-field-link");
  if (fieldLink) fieldLink.href = d.fieldDetailUrl;

  $("customer-use-btn")?.addEventListener("click", () => {
    logKnowledgeUsedV3(
      {
        knowledgeId: d.id,
        kind: d.kind,
        title: d.title,
        query: "",
        projectId: "",
        category: d.category || "",
        source: "customer-detail",
      },
      getCustomerToken()
    );
    toast("記録しました。ありがとうございます");
  });
}

async function loadDetail() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const kind = params.get("kind") || "";
  if (!id) {
    $("customer-detail-root").innerHTML = '<p class="status-muted">資料が指定されていません</p>';
    return;
  }

  const token = getCustomerToken();
  const qs = new URLSearchParams({ id });
  if (kind) qs.set("kind", kind);
  const res = await fetch(`/api/knowledge/customer-detail-v1?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $("customer-detail-root").innerHTML = `<p class="status-muted">${escapeHtml(data.error || "読み込み失敗")}</p>`;
    return;
  }

  $("customer-detail-root").innerHTML = renderDetail(data.detail);
  document.title = `TiSLY — ${data.detail.title}`;
  bindDetailEvents(data.detail);
}

async function init() {
  await requireCustomerLogin();
  await loadDetail();
}

init();

import { escapeHtml, goCustomerBack } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").pop() || "");

document.getElementById("btn-back")?.addEventListener("click", () => goCustomerBack());

async function load() {
  const res = await fetch(`/api/customer-portal/v1/project/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "案件を準備中です")}</p>`;
    return;
  }

  document.getElementById("page-title").textContent = data.propertyName;
  document.getElementById("page-subtitle").innerHTML =
    `<span class="cv-status">${escapeHtml(data.statusLabel)}</span>`;

  const photos = (data.sitePhotos || [])
    .map(
      (p) =>
        `<figure><img src="${escapeHtml(p.previewUrl)}" alt="${escapeHtml(p.title)}" loading="lazy" /><figcaption>${escapeHtml(p.title)}</figcaption></figure>`
    )
    .join("");

  const docs = (data.documents || [])
    .map(
      (d) =>
        `<a href="${escapeHtml(d.openUrl)}">${escapeHtml(d.label)}</a>`
    )
    .join("");

  const c = data.contact || {};
  main.innerHTML = `
    <section class="cv-card">
      <h2>工事内容</h2>
      <p class="cv-explanation">${escapeHtml(data.workDescription)}</p>
    </section>
    ${
      data.customerExplanation
        ? `<section class="cv-card"><h2>お客様向け説明</h2><p class="cv-explanation">${escapeHtml(data.customerExplanation)}</p></section>`
        : ""
    }
    ${
      photos
        ? `<section class="cv-card"><h2>現場写真</h2><div class="cv-photo-grid">${photos}</div></section>`
        : ""
    }
    ${
      docs
        ? `<section class="cv-card cv-doc-list"><h2>資料</h2>${docs}</section>`
        : `<section class="cv-card"><p class="cv-preparing">資料を準備中です</p></section>`
    }
    ${
      data.monitoringUrl
        ? `<section class="cv-card"><a class="cv-btn" href="${escapeHtml(data.monitoringUrl)}">セキュリティ・監視画面を見る</a></section>`
        : ""
    }
    <section class="cv-card cv-contact">
      <h2>連絡先</h2>
      <dl>
        <dt>会社名</dt><dd>${escapeHtml(c.companyName || "株式会社TOMS")}</dd>
        ${c.phone ? `<dt>TEL</dt><dd>${escapeHtml(c.phone)}</dd>` : ""}
        ${c.staffName ? `<dt>担当</dt><dd>${escapeHtml(c.staffName)}</dd>` : ""}
      </dl>
    </section>
    ${
      docs
        ? `<a class="cv-btn" href="${escapeHtml(data.documentCenterUrl)}">資料を見る</a>`
        : ""
    }
  `;
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

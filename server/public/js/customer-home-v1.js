import { escapeHtml, goCustomerBack } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const customerCode = location.pathname.split("/").filter(Boolean)[1] || "TOMS001";

document.getElementById("btn-back")?.addEventListener("click", () => goCustomerBack());

async function load() {
  const res = await fetch(`/api/customer-portal/v1/home/${encodeURIComponent(customerCode)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
    return;
  }

  document.getElementById("page-title").textContent = data.customerName || "お客様案件一覧";
  document.getElementById("page-subtitle").textContent = "ご契約中の工事一覧";

  const projects = (data.projects || [])
    .map(
      (p) =>
        `<a class="cv-project-link" href="${escapeHtml(p.projectPageUrl)}">
          <strong>${escapeHtml(p.propertyName)}</strong>
          <span>${escapeHtml(p.workDescription)} · ${escapeHtml(p.statusLabel)}</span>
        </a>`
    )
    .join("");

  const c = data.contact || {};
  main.innerHTML = `
    <section class="cv-card">
      <h2>工事一覧</h2>
      ${projects || `<p class="cv-preparing">案件を準備中です</p>`}
    </section>
    <section class="cv-card cv-contact">
      <h2>連絡先</h2>
      <dl>
        <dt>会社名</dt><dd>${escapeHtml(c.companyName || "株式会社TOMS")}</dd>
        ${c.phone ? `<dt>TEL</dt><dd>${escapeHtml(c.phone)}</dd>` : ""}
        ${c.email ? `<dt>メール</dt><dd>${escapeHtml(c.email)}</dd>` : ""}
      </dl>
    </section>
  `;
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

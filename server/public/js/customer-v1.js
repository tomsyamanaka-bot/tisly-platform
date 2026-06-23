import { escapeHtml } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");

async function load() {
  const res = await fetch("/api/customer-portal/v1/landing", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
    return;
  }

  document.getElementById("page-title").textContent = data.title;
  document.getElementById("page-subtitle").textContent = data.subtitle;

  const projects = (data.demoProjects || [])
    .map(
      (p) =>
        `<a class="cv-project-link" href="${escapeHtml(p.projectPageUrl)}">
          <strong>${escapeHtml(p.propertyName)}</strong>
          <span>工事詳細を見る →</span>
        </a>`
    )
    .join("");

  main.innerHTML = `
    <section class="cv-card">
      <h2>デモ案件</h2>
      ${projects || `<p class="cv-preparing">案件を準備中です</p>`}
    </section>
    <section class="cv-card cv-contact">
      <h2>連絡先</h2>
      <dl>
        <dt>会社名</dt><dd>株式会社TOMS</dd>
        <dt>TEL</dt><dd>048-000-0000</dd>
      </dl>
    </section>
  `;
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

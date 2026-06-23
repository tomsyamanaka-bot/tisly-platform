import {
  bindCustomerNavLinks,
  escapeHtml,
  renderContact,
  renderMaintenance,
  renderProjectDocuments,
  renderProjectPhotos,
} from "./customer-shared-v1.js";
import { goCustomerBack, initCustomerPage, navigateCustomer } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").pop() || "");

initCustomerPage();
document.getElementById("btn-back")?.addEventListener("click", () => goCustomerBack());

async function load() {
  const res = await fetch(`/api/customer-portal/v1/project/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "資料を準備中です")}</p>`;
    return;
  }

  document.getElementById("page-title").textContent = data.propertyName;
  document.getElementById("page-subtitle").textContent = data.workDescription || "";

  const cards = `
    <section class="cv-card-grid cv-card-grid-compact">
      <a class="cv-big-card" href="${escapeHtml(data.monitoringUrl)}?view=camera" data-customer-nav>
        <span class="cv-big-card-emoji">📷</span><span class="cv-big-card-label">カメラを見る</span>
      </a>
      <a class="cv-big-card" href="${escapeHtml(data.monitoringUrl)}?view=alerts" data-customer-nav>
        <span class="cv-big-card-emoji">🚨</span><span class="cv-big-card-label">警報履歴</span>
      </a>
      <a class="cv-big-card" href="${escapeHtml(data.monitoringUrl)}?view=notifications" data-customer-nav>
        <span class="cv-big-card-emoji">🔔</span><span class="cv-big-card-label">通知履歴</span>
      </a>
    </section>
  `;

  main.innerHTML = `
    ${cards}
    <section class="cv-card" id="documents">
      <h2>書類</h2>
      <div class="cv-doc-list">${renderProjectDocuments(data.documents)}</div>
    </section>
    ${renderProjectPhotos(data.sitePhotos)}
    ${renderMaintenance(data.maintenanceItems)}
    ${
      data.customerExplanation
        ? `<section class="cv-card"><h2>ご説明</h2><p class="cv-explanation">${escapeHtml(data.customerExplanation)}</p></section>`
        : ""
    }
    ${renderContact(data.contact)}
  `;

  bindCustomerNavLinks();
  document.querySelectorAll(".cv-big-card, .cv-doc-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateCustomer(el.getAttribute("href"));
    });
  });

  const hash = location.hash.replace("#", "");
  if (hash) {
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    });
  }
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

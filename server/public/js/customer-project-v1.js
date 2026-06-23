import {
  bindCustomerNavLinks,
  escapeHtml,
  CUSTOMER_PROJECT_LABELS,
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
  document.getElementById("page-subtitle").textContent = data.workDescription
    ? `${CUSTOMER_PROJECT_LABELS.workName}：${data.workDescription}`
    : "";

  main.innerHTML = `
    <section class="cv-card" id="documents">
      <h2>${escapeHtml(CUSTOMER_PROJECT_LABELS.documents)}</h2>
      <div class="cv-doc-list">${renderProjectDocuments(data.documents)}</div>
    </section>
    ${renderProjectPhotos(data.sitePhotos)}
    ${renderMaintenance(data.maintenanceItems)}
  `;

  bindCustomerNavLinks();
  document.querySelectorAll(".cv-doc-btn").forEach((el) => {
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

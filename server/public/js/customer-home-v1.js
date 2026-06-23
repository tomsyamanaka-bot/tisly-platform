import {
  bindCustomerNavLinks,
  renderPropertyList,
} from "./customer-shared-v1.js";
import { goCustomerBack, initCustomerPage, navigateCustomer } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const customerCode = location.pathname.split("/").filter(Boolean)[1] || "TOMS001";

initCustomerPage();
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

  document.getElementById("page-title").textContent = data.customerName || "物件一覧";
  document.getElementById("page-subtitle").textContent = "ご契約中の物件";

  main.innerHTML = `
    <section class="cv-list-wrap">
      ${renderPropertyList(data.projects)}
    </section>
  `;

  bindCustomerNavLinks();
  document.querySelectorAll(".cv-property-card-main, .cv-action-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      const href = el.getAttribute("href");
      if (!href || href.startsWith("tel:")) return;
      e.preventDefault();
      navigateCustomer(href);
    });
  });
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

import { escapeHtml, goCustomerBack, initCustomerPage, navigateCustomer } from "./customer-nav-v1.js";

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

  document.getElementById("page-title").textContent = data.customerName || "お客様";
  document.getElementById("page-subtitle").textContent = "ご契約中の物件一覧";

  const projects = (data.projects || [])
    .map(
      (p) =>
        `<a class="cv-project-link" href="${escapeHtml(p.homePageUrl || p.projectPageUrl)}" data-customer-nav>
          <strong>${escapeHtml(p.propertyName)}</strong>
          <span>${escapeHtml(p.workDescription)} · ${escapeHtml(p.statusLabel)}</span>
        </a>`
    )
    .join("");

  main.innerHTML = `
    <section class="cv-card">
      <h2>物件一覧</h2>
      ${projects || `<p class="cv-preparing">物件を準備中です</p>`}
    </section>
  `;

  document.querySelectorAll("[data-customer-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateCustomer(el.getAttribute("href"));
    });
  });
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

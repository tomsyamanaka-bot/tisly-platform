import {
  bindCustomerNavLinks,
  renderHomeCards,
  renderHomeStatus,
  renderNotifications,
} from "./customer-shared-v1.js";
import { navigateCustomer, setCustomerReturnUrl } from "./customer-nav-v1.js";
import { initCustomerCacheGuard } from "./customer-cache-v1.js";

const main = document.getElementById("main-content");

initCustomerCacheGuard().catch(() => {});

async function load() {
  const params = new URLSearchParams(location.search);
  const projectShare = params.get("project");

  let data;
  if (projectShare) {
    const res = await fetch(
      `/api/customer-portal/v1/home-by-share/${encodeURIComponent(projectShare)}`,
      { cache: "no-store" }
    );
    data = await res.json().catch(() => ({}));
    if (!res.ok) data = null;
  }

  if (!data || data.status === "error") {
    const res = await fetch("/api/customer-portal/v1/landing", { cache: "no-store" });
    const landing = await res.json().catch(() => ({}));
    if (!res.ok) {
      main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
      return;
    }
    data = landing.home;
  }

  document.getElementById("page-title").textContent = data.title;
  document.getElementById("page-subtitle").textContent = "";

  main.innerHTML = `
    ${renderHomeStatus(data)}
    ${renderNotifications(data.notifications)}
    ${renderHomeCards(data.cards)}
  `;

  bindCustomerNavLinks();
  document.querySelectorAll(".cv-big-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateCustomer(el.getAttribute("href"));
    });
  });
}

setCustomerReturnUrl("/customer");
load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

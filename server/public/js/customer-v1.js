import {
  bindCustomerNavLinks,
  escapeHtml,
  renderHomeCards,
  renderHomeStatus,
} from "./customer-shared-v1.js";
import { goCustomerBack, navigateCustomer, setCustomerReturnUrl } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");

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
  document.getElementById("page-subtitle").textContent = data.subtitle || data.propertyName;

  const demos = (await fetch("/api/customer-portal/v1/landing", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({}))).demoProjects;

  const demoLinks =
    demos?.length > 1
      ? `<section class="cv-card cv-demo-switch">
          <h2>物件を切り替える</h2>
          ${demos
            .map(
              (p) =>
                `<a class="cv-project-link" href="/customer?project=${encodeURIComponent(p.shareId)}" data-customer-nav>${escapeHtml(p.propertyName)}</a>`
            )
            .join("")}
        </section>`
      : "";

  main.innerHTML = `
    ${renderHomeStatus(data)}
    ${renderHomeCards(data.cards)}
    ${demoLinks}
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

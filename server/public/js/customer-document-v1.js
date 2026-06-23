import { escapeHtml, goCustomerBack } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] || "");
const fileId = new URLSearchParams(location.search).get("fileId") || "";

document.getElementById("btn-back")?.addEventListener("click", () => {
  goCustomerBack({ shareId });
});

async function load() {
  const qs = fileId ? `?fileId=${encodeURIComponent(fileId)}` : "";
  const res = await fetch(
    `/api/customer-portal/v1/document/${encodeURIComponent(shareId)}${qs}`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "資料を準備中です")}</p>`;
    return;
  }

  document.getElementById("page-title").textContent = data.label || "資料閲覧";
  document.getElementById("page-subtitle").textContent = data.propertyName || "";

  if (data.previewUrl) {
    main.innerHTML = `
      <section class="cv-card">
        <iframe class="cv-pdf-frame" src="${escapeHtml(data.previewUrl)}" title="${escapeHtml(data.label)}"></iframe>
      </section>
    `;
  } else {
    main.innerHTML = `<p class="cv-preparing">資料を準備中です</p>`;
  }
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

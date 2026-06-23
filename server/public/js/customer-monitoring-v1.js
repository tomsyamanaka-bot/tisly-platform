import { escapeHtml, goCustomerBack } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] || "");

document.getElementById("btn-back")?.addEventListener("click", () => {
  goCustomerBack({ shareId });
});

async function load() {
  const res = await fetch(`/api/customer-portal/v1/monitoring/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "監視画面を準備中です")}</p>`;
    return;
  }

  document.getElementById("page-title").textContent = "セキュリティ・監視";
  document.getElementById("page-subtitle").textContent = data.propertyName || "";

  main.innerHTML = `
    <section class="cv-card">
      <p class="cv-explanation">設置されたセキュリティ機器の状態をご確認いただけます。</p>
      <iframe class="cv-pdf-frame" src="${escapeHtml(data.monitoringEmbedUrl)}" title="監視画面"></iframe>
    </section>
  `;
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

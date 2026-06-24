import {
  bindCustomerNavLinks,
  CUSTOMER_CONTACT_LABEL,
  CUSTOMER_DOCUMENT_ACTIONS,
  CUSTOMER_PROJECT_LABELS,
  renderContactActionsBar,
  renderMaintenance,
  renderProjectDocuments,
  renderProjectPhotos,
} from "./customer-shared-v1.js";
import { goCustomerBack, initCustomerPage, navigateCustomer } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").pop() || "");

let projectData = null;

initCustomerPage();
document.getElementById("btn-back")?.addEventListener("click", () => goCustomerBack());

function toast(msg) {
  const el = document.createElement("div");
  el.className = "cv-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function firstDocumentUrl() {
  const doc = projectData?.documents?.[0];
  return doc?.openUrl || "";
}

async function handlePdfView() {
  const url = firstDocumentUrl();
  if (!url) {
    toast("書類を準備中です");
    return;
  }
  navigateCustomer(url);
}

async function handleSave() {
  const doc = projectData?.documents?.[0];
  const url = doc?.openUrl;
  if (!url) {
    toast("書類を準備中です");
    return;
  }
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.label || "document"}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("保存しました");
  } catch {
    window.open(url, "_blank", "noopener");
    toast("ブラウザで開きました");
  }
}

function wireBottomBar(data) {
  const bottomBar = document.querySelector(".cv-bottom-bar");
  if (!bottomBar) return;
  bottomBar.classList.add("cv-bottom-bar-4");
  const contactHtml = renderContactActionsBar(
    data.contactActions,
    contactTelHrefFromData(data, ""),
    CUSTOMER_CONTACT_LABEL
  );
  bottomBar.innerHTML = `
    <button type="button" class="cv-btn secondary" id="btn-back-bar">${escapeHtml(CUSTOMER_DOCUMENT_ACTIONS.back)}</button>
    <button type="button" class="cv-btn" id="btn-pdf-view">${escapeHtml(CUSTOMER_DOCUMENT_ACTIONS.pdfView)}</button>
    <button type="button" class="cv-btn secondary" id="btn-save">${escapeHtml(CUSTOMER_DOCUMENT_ACTIONS.save)}</button>
  `;
  if (contactHtml) {
    bottomBar.insertAdjacentHTML("beforeend", contactHtml);
  }
  document.getElementById("btn-back-bar")?.addEventListener("click", () => goCustomerBack());
  document.getElementById("btn-pdf-view")?.addEventListener("click", () => handlePdfView());
  document.getElementById("btn-save")?.addEventListener("click", () => handleSave());
}

function wireActionButtons() {
  bindCustomerNavLinks();
  document.querySelectorAll(".cv-doc-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      const href = el.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      navigateCustomer(href);
    });
  });
}

async function load() {
  const res = await fetch(`/api/customer-portal/v1/project/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "資料を準備中です")}</p>`;
    return;
  }

  projectData = data;
  const contactTel = data.quickActions?.find((a) => a.id === "contact")?.href || "";

  document.getElementById("page-title").textContent = data.propertyName;
  document.getElementById("page-subtitle").textContent = "";

  main.innerHTML = `
    ${renderProjectPhotos(data.sitePhotos)}
    <section class="cv-card" id="documents">
      <h2>${escapeHtml(CUSTOMER_PROJECT_LABELS.documents)}</h2>
      <div class="cv-doc-list">${renderProjectDocuments(data.documents)}</div>
    </section>
    ${renderMaintenance(data.maintenanceItems)}
  `;

  wireBottomBar(data);
  wireActionButtons();

  const hash = location.hash.replace("#", "");
  if (hash) {
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    });
  }
}

function contactTelHrefFromData(data, fallback) {
  if (fallback?.startsWith("tel:")) return fallback;
  const phone = String(data.contact?.phone ?? "").replace(/[^\d+]/g, "");
  return phone ? `tel:${phone}` : "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

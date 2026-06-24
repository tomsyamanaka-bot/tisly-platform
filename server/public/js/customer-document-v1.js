import { escapeHtml, CUSTOMER_DOCUMENT_ACTIONS } from "./customer-shared-v1.js";
import { initCustomerPage } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] || "");
const params = new URLSearchParams(location.search);
const fileId = params.get("fileId") || "";
const docType = params.get("docType") || "";

const PREPARING_HTML = `
  <section class="cv-card cv-preparing-card">
    <p class="cv-preparing">書類を準備中です</p>
    <p class="cv-preparing-sub">時間をおいて再度開いてください</p>
    <p class="cv-preparing-sub">お急ぎの場合はTOMSへご連絡ください</p>
  </section>
`;

let docData = null;

function goProjectBack() {
  location.href = `/customer/project/${encodeURIComponent(shareId)}`;
}

initCustomerPage();

function toast(msg) {
  const el = document.createElement("div");
  el.className = "cv-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function showPreparing(message) {
  main.innerHTML = PREPARING_HTML;
  if (message) {
    const sub = main.querySelector(".cv-preparing-sub");
    if (sub) sub.textContent = message;
  }
}

async function handlePdfOpen() {
  const url = docData?.pdfUrl || docData?.previewUrl;
  if (!url || docData?.status === "preparing") {
    toast("書類を準備中です");
    return;
  }
  window.open(url, "_blank", "noopener");
}

async function handleSave() {
  const url = docData?.pdfUrl || docData?.previewUrl;
  if (!url || docData?.status === "preparing") {
    toast("書類を準備中です");
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      showPreparing();
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${docData.label || "document"}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("保存しました");
  } catch {
    window.open(url, "_blank", "noopener");
    toast("ブラウザで開きました");
  }
}

function wireBottomBar() {
  const bottomBar = document.querySelector(".cv-bottom-bar");
  if (!bottomBar) return;
  bottomBar.innerHTML = `
    <button type="button" class="cv-btn secondary" id="btn-back">${escapeHtml(CUSTOMER_DOCUMENT_ACTIONS.back)}</button>
    <button type="button" class="cv-btn" id="btn-pdf">${escapeHtml(CUSTOMER_DOCUMENT_ACTIONS.pdfView)}</button>
    <button type="button" class="cv-btn secondary" id="btn-save">${escapeHtml(CUSTOMER_DOCUMENT_ACTIONS.save)}</button>
  `;
  document.getElementById("btn-back")?.addEventListener("click", goProjectBack);
  document.getElementById("btn-pdf")?.addEventListener("click", () => handlePdfOpen());
  document.getElementById("btn-save")?.addEventListener("click", () => handleSave());
}

async function verifyPdfPreview(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("pdf") || ct.includes("octet-stream") || ct.includes("image");
  } catch {
    return false;
  }
}

async function renderPdfFrame(url, label) {
  const ok = await verifyPdfPreview(url);
  if (!ok) {
    showPreparing();
    return;
  }
  main.innerHTML = `
    <section class="cv-card cv-doc-viewer">
      <iframe class="cv-pdf-frame" src="${escapeHtml(url)}" title="${escapeHtml(label)}"></iframe>
    </section>
  `;
  const frame = main.querySelector(".cv-pdf-frame");
  frame?.addEventListener("error", () => showPreparing());
}

async function load() {
  const qs = new URLSearchParams();
  if (fileId) qs.set("fileId", fileId);
  if (docType) qs.set("docType", docType);
  const query = qs.toString() ? `?${qs}` : "";

  let res;
  try {
    res = await fetch(
      `/api/customer-portal/v1/document/${encodeURIComponent(shareId)}${query}`,
      { cache: "no-store" }
    );
  } catch {
    showPreparing();
    wireBottomBar();
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || res.status >= 500) {
    showPreparing(data.message || data.error);
    wireBottomBar();
    return;
  }

  docData = data;
  document.getElementById("page-title").textContent = data.label || "書類";
  document.getElementById("page-subtitle").textContent = data.propertyName || "";

  wireBottomBar();

  if (data.status === "preparing" || !data.previewUrl) {
    showPreparing(data.message);
    return;
  }

  await renderPdfFrame(data.previewUrl, data.label || "書類");
}

wireBottomBar();
load().catch(() => {
  showPreparing();
  wireBottomBar();
});

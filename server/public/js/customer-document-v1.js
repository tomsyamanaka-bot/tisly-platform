import { escapeHtml } from "./customer-shared-v1.js";
import { initCustomerPage } from "./customer-nav-v1.js";

const main = document.getElementById("main-content");
const shareId = decodeURIComponent(location.pathname.split("/").filter(Boolean)[2] || "");
const fileId = new URLSearchParams(location.search).get("fileId") || "";

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

async function handlePdfOpen() {
  const url = docData?.pdfUrl || docData?.previewUrl;
  if (!url) {
    toast("書類を準備中です");
    return;
  }
  window.open(url, "_blank", "noopener");
}

async function handleSave() {
  const url = docData?.pdfUrl || docData?.previewUrl;
  if (!url) {
    toast("書類を準備中です");
    return;
  }
  try {
    const res = await fetch(url);
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
    <button type="button" class="cv-btn secondary" id="btn-back">戻る</button>
    <button type="button" class="cv-btn" id="btn-pdf">PDFにする</button>
    <button type="button" class="cv-btn secondary" id="btn-save">保存</button>
  `;
  document.getElementById("btn-back")?.addEventListener("click", goProjectBack);
  document.getElementById("btn-pdf")?.addEventListener("click", () => handlePdfOpen());
  document.getElementById("btn-save")?.addEventListener("click", () => handleSave());
}

async function load() {
  const qs = fileId ? `?fileId=${encodeURIComponent(fileId)}` : "";
  const res = await fetch(
    `/api/customer-portal/v1/document/${encodeURIComponent(shareId)}${qs}`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    main.innerHTML = `<p class="cv-preparing">${escapeHtml(data.error || "書類を準備中です")}</p>`;
    return;
  }

  docData = data;
  document.getElementById("page-title").textContent = data.label || "書類";
  document.getElementById("page-subtitle").textContent = data.propertyName || "";

  wireBottomBar();

  if (data.previewUrl) {
    main.innerHTML = `
      <section class="cv-card cv-doc-viewer">
        <iframe class="cv-pdf-frame" src="${escapeHtml(data.previewUrl)}" title="${escapeHtml(data.label)}"></iframe>
      </section>
    `;
  } else {
    main.innerHTML = `<p class="cv-preparing">書類を準備中です</p>`;
  }
}

wireBottomBar();
load().catch(() => {
  main.innerHTML = `<p class="cv-preparing">読み込みに失敗しました</p>`;
});

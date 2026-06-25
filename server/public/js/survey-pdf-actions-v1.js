/**
 * 現調PWA向け — 仕様書PDF操作（見積送り済み案件のみ）
 */
import { getCustomerToken } from "./customer-auth.js";
import { navigateTo } from "./tisly-navigation-stack-v1.js";
import { sharePdfAsFile, triggerDownload, prefetchPdfForShare } from "./pdf-share-v1.js";

function pdfAuthHeaders() {
  return { Authorization: `Bearer ${getCustomerToken()}` };
}

function buildPdfFetchUrl(pdfPath) {
  const token = getCustomerToken();
  const sep = pdfPath.includes("?") ? "&" : "?";
  return `${pdfPath}${sep}access_token=${encodeURIComponent(token)}`;
}

export function buildSpecificationDocumentViewerUrl(businessProjectId, returnPath = "/survey-v1") {
  const params = new URLSearchParams({
    projectId: businessProjectId,
    kind: "specification",
    return: returnPath,
  });
  return `/document-viewer-v1.html?${params}`;
}

export function getSpecificationPdfApiUrl(businessProjectId) {
  return `/api/estimate/v1/projects/${encodeURIComponent(businessProjectId)}/specification/pdf`;
}

export function getSpecificationRegenerateUrl(businessProjectId) {
  return `/api/estimate/v1/projects/${encodeURIComponent(businessProjectId)}/specification/pdf/regenerate`;
}

export function openSpecificationPreview(businessProjectId, returnPath) {
  navigateTo(buildSpecificationDocumentViewerUrl(businessProjectId, returnPath));
}

export async function saveSpecificationPdf(businessProjectId, fileName, toast) {
  const fetchUrl = buildPdfFetchUrl(getSpecificationPdfApiUrl(businessProjectId));
  const blob = await prefetchPdfForShare({
    fetchUrl,
    getHeaders: pdfAuthHeaders,
    regenerateUrl: getSpecificationRegenerateUrl(businessProjectId),
  });
  triggerDownload(blob, fileName || "仕様書.pdf");
  toast?.("PDFを保存しました");
}

export async function shareSpecificationPdf(businessProjectId, fileName, toast) {
  await sharePdfAsFile({
    fetchUrl: buildPdfFetchUrl(getSpecificationPdfApiUrl(businessProjectId)),
    fileName: fileName || "仕様書.pdf",
    getHeaders: pdfAuthHeaders,
    regenerateUrl: getSpecificationRegenerateUrl(businessProjectId),
    toast,
  });
}

export async function regenerateSpecificationPdf(businessProjectId, toast) {
  const res = await fetch(getSpecificationRegenerateUrl(businessProjectId), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...pdfAuthHeaders() },
    body: "{}",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `PDF再生成失敗 (${res.status})`);
  }
  toast?.("PDFを再作成しました");
}

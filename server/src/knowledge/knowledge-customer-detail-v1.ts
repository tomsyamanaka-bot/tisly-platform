/** Knowledge Customer UI V1 — お客様向け詳細（内部情報を除外） */

import type { KnowledgeAttachmentV1 } from "./knowledge-attachments-v1.js";
import { buildCustomerExplanationV1, type KnowledgeCustomerExplanationV1 } from "./knowledge-customer-explanation-v1.js";
import { buildCustomerSiteLocationsV1, type KnowledgeCustomerSiteLocationV1 } from "./knowledge-customer-site-map-v1.js";
import { getKnowledgeDetailV1 } from "./knowledge-detail-v1.js";
import type { UnifiedKnowledgeKindV1 } from "./unified-knowledge-search-v1.js";

export interface KnowledgeCustomerPhotoV1 {
  previewUrl: string;
  label: string;
}

export interface KnowledgeCustomerPdfV1 {
  label: string;
  viewUrl: string;
}

export interface KnowledgeCustomerPartV1 {
  label: string;
  fileType: string;
  viewUrl?: string;
}

export interface KnowledgeCustomerRelatedV1 {
  id: string;
  kind: UnifiedKnowledgeKindV1;
  title: string;
  category: string;
  detailUrl: string;
}

export interface KnowledgeCustomerBeforeAfterV1 {
  beforeLabel: string;
  afterLabel: string;
  summary: string;
}

export interface KnowledgeCustomerDetailV1 {
  id: string;
  kind: UnifiedKnowledgeKindV1;
  title: string;
  category: string;
  explanation: KnowledgeCustomerExplanationV1;
  photos: KnowledgeCustomerPhotoV1[];
  beforeAfter: KnowledgeCustomerBeforeAfterV1;
  pdfs: KnowledgeCustomerPdfV1[];
  parts3d: KnowledgeCustomerPartV1[];
  relatedItems: KnowledgeCustomerRelatedV1[];
  siteLocations: KnowledgeCustomerSiteLocationV1[];
  fieldDetailUrl: string;
  customerHomeUrl: string;
}

function safePreviewUrl(att: KnowledgeAttachmentV1): string | undefined {
  const url = att.previewUrl || att.openUrl;
  if (!url) return undefined;
  if (/QNAP|SMB|WebDAV|192\.168\.|filemanager|mock fallback/i.test(url)) return undefined;
  return url;
}

function safeViewUrl(att: KnowledgeAttachmentV1): string | undefined {
  const url = att.previewUrl || att.openUrl;
  if (!url) return undefined;
  if (/QNAP|SMB|WebDAV|192\.168\.|filemanager/i.test(url)) return undefined;
  return url;
}

function buildBeforeAfter(category: string, title: string): KnowledgeCustomerBeforeAfterV1 {
  if (category.includes("防犯") || category.includes("カメラ")) {
    return {
      beforeLabel: "施工前",
      afterLabel: "施工後",
      summary: "見えにくかった場所も、設置後は見守りやすくなります。",
    };
  }
  if (category.includes("PLC") || category.includes("工場")) {
    return {
      beforeLabel: "改善前",
      afterLabel: "改善後",
      summary: "手作業や不安定な動作から、安全で分かりやすい制御へ整えます。",
    };
  }
  if (category.includes("照明") || category.includes("ライト")) {
    return {
      beforeLabel: "施工前",
      afterLabel: "施工後",
      summary: "暗かった場所も、足元まで明るく使いやすくなります。",
    };
  }
  return {
    beforeLabel: "施工前",
    afterLabel: "施工後",
    summary: `「${title}」の施工により、使いやすさと安心感が高まります。`,
  };
}

export function getKnowledgeCustomerDetailV1(
  id: string,
  kindHint?: UnifiedKnowledgeKindV1
): KnowledgeCustomerDetailV1 | null {
  const detail = getKnowledgeDetailV1(id, kindHint);
  if (!detail) return null;

  const explanation = buildCustomerExplanationV1(detail);
  const kindQs = detail.kind ? `&kind=${encodeURIComponent(detail.kind)}` : "";

  const photos: KnowledgeCustomerPhotoV1[] = [];
  for (const att of detail.relatedPhotos) {
    const previewUrl = safePreviewUrl(att);
    if (previewUrl) {
      photos.push({ previewUrl, label: att.label || "写真" });
    }
  }
  if (!photos.length && detail.hasPhoto) {
    for (const att of detail.attachments) {
      if (att.fileType !== "photo") continue;
      const previewUrl = safePreviewUrl(att);
      if (previewUrl) photos.push({ previewUrl, label: att.label || "写真" });
    }
  }

  const pdfs: KnowledgeCustomerPdfV1[] = [];
  for (const att of detail.relatedPdfs) {
    const viewUrl = safeViewUrl(att);
    if (viewUrl) pdfs.push({ label: att.label || "PDF資料", viewUrl });
  }
  if (!pdfs.length && detail.hasPdf) {
    for (const att of detail.attachments) {
      if (att.fileType !== "pdf") continue;
      const viewUrl = safeViewUrl(att);
      if (viewUrl) pdfs.push({ label: att.label || "PDF資料", viewUrl });
    }
  }

  const parts3d: KnowledgeCustomerPartV1[] = [];
  for (const att of [...detail.related3dPrint, ...detail.attachments.filter((a) => ["stl", "step", "gcode"].includes(a.fileType))]) {
    if (!["stl", "step", "gcode", "other"].includes(att.fileType)) continue;
    parts3d.push({
      label: att.label || "部品資料",
      fileType: att.fileType === "other" ? "部品" : att.fileType.toUpperCase(),
      viewUrl: safeViewUrl(att),
    });
  }

  const relatedItems: KnowledgeCustomerRelatedV1[] = (detail.relatedKnowledge || []).slice(0, 6).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    category: r.category,
    detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(r.id)}&kind=${encodeURIComponent(r.kind)}`,
  }));

  return {
    id: detail.id,
    kind: detail.kind,
    title: detail.title,
    category: detail.category,
    explanation,
    photos,
    beforeAfter: buildBeforeAfter(detail.category, detail.title),
    pdfs,
    parts3d,
    relatedItems,
    siteLocations: buildCustomerSiteLocationsV1(detail.category, detail.tags),
    fieldDetailUrl: `/knowledge-detail-v1?id=${encodeURIComponent(detail.id)}${kindQs}`,
    customerHomeUrl: "/knowledge-customer-v1",
  };
}

/** レスポンス JSON に内部情報が含まれないことをテスト用に検証 */
export function assertCustomerDetailSanitizedV1(payload: unknown): boolean {
  const text = JSON.stringify(payload);
  const forbidden = /QNAP|SMB|WebDAV|192\.168\.|projectId|userId|mock fallback|filemanager|\\\\/i;
  return !forbidden.test(text);
}

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
  beforePoints: string[];
  afterPoints: string[];
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
  customerHomeV2Url: string;
  projectPageUrl?: string;
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
      beforeLabel: "Before",
      afterLabel: "After",
      summary: "見えにくかった場所も、設置後は見守りやすくなります。",
      beforePoints: ["夜間が暗い", "誰が来たかわかりにくい", "異常時に気づきにくい"],
      afterPoints: ["ライトとカメラで確認しやすい", "スマホで通知を受け取れる", "記録を後から確認できる"],
    };
  }
  if (category.includes("PLC") || category.includes("工場")) {
    return {
      beforeLabel: "Before",
      afterLabel: "After",
      summary: "手作業や不安定な動作から、安全で分かりやすい制御へ整えます。",
      beforePoints: ["停止方法が分かりにくい", "異常時の対応が遅れやすい", "配線・ラベルが乱れている"],
      afterPoints: ["非常停止が確実に動く", "ランプで状態が分かる", "メンテナンスしやすい配線"],
    };
  }
  if (category.includes("照明") || category.includes("ライト")) {
    return {
      beforeLabel: "Before",
      afterLabel: "After",
      summary: "暗かった場所も、足元まで明るく使いやすくなります。",
      beforePoints: ["夜間の足元が暗い", "来客時に明るさが足りない", "スイッチ位置が分かりにくい"],
      afterPoints: ["人感で自動点灯", "必要な場所だけ明るく", "安全に移動できる"],
    };
  }
  if (category.includes("ネットワーク") || category.includes("LAN") || category.includes("Wi-Fi")) {
    return {
      beforeLabel: "Before",
      afterLabel: "After",
      summary: "通信の届きにくい場所を改善し、安定した接続環境に整えます。",
      beforePoints: ["Wi-Fiが届きにくい席がある", "配線が分かりにくい", "障害時の切り分けが難しい"],
      afterPoints: ["主要エリアで安定接続", "ラベルで配線が分かる", "保守しやすい構成"],
    };
  }
  return {
    beforeLabel: "Before",
    afterLabel: "After",
    summary: `「${title}」の施工により、使いやすさと安心感が高まります。`,
    beforePoints: ["確認に時間がかかる", "説明が口頭だけになりがち", "記録が残りにくい"],
    afterPoints: ["資料でイメージを共有できる", "施工後の確認ポイントが明確", "後から見返せる"],
  };
}

export function getKnowledgeCustomerDetailV1(
  id: string,
  kindHint?: UnifiedKnowledgeKindV1,
  projectRef?: string
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
    customerHomeV2Url: "/knowledge-customer-v2",
    projectPageUrl: projectRef
      ? `/knowledge-customer-project-v1?ref=${encodeURIComponent(projectRef)}`
      : undefined,
  };
}

/** レスポンス JSON に内部情報が含まれないことをテスト用に検証 */
export function assertCustomerDetailSanitizedV1(payload: unknown): boolean {
  const text = JSON.stringify(payload);
  const forbidden = /QNAP|SMB|WebDAV|192\.168\.|projectId|userId|mock fallback|filemanager|\\\\/i;
  return !forbidden.test(text);
}

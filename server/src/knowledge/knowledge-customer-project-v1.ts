/** Knowledge Customer UI V2 — 案件別お客様向けページ（mock · 将来案件DB連動） */

import { getKnowledgeCustomerDetailV1 } from "./knowledge-customer-detail-v1.js";
import {
  getCustomerSiteMapForProjectV1,
  type KnowledgeCustomerSiteAreaV1,
} from "./knowledge-customer-site-map-v1.js";
import { unifiedKnowledgeSearchV1 } from "./unified-knowledge-search-v1.js";

export interface KnowledgeCustomerProjectSummaryV1 {
  ref: string;
  propertyName: string;
  workGenre: string;
  icon: string;
  pageUrl: string;
  siteMapUrl: string;
}

export interface KnowledgeCustomerMaterialItemV1 {
  id: string;
  kind: string;
  type: "photo" | "video" | "explanation" | "pdf" | "part" | "knowledge";
  title: string;
  category: string;
  description?: string;
  previewUrl?: string;
  viewUrl?: string;
  tags: string[];
  hasPhoto: boolean;
  hasPdf: boolean;
  hasPart: boolean;
  hasExplanation: boolean;
  detailUrl: string;
}

export interface KnowledgeCustomerProjectPageV1 {
  propertyName: string;
  workGenre: string;
  customerExplanation: string;
  capabilities: string[];
  relatedKnowledge: Array<{
    id: string;
    kind: string;
    title: string;
    category: string;
    detailUrl: string;
  }>;
  relatedPhotos: Array<{ label: string; previewUrl?: string }>;
  relatedPdfs: Array<{ label: string; viewUrl?: string }>;
  materials: KnowledgeCustomerMaterialItemV1[];
  siteMapUrl: string;
  materialsSectionLabel: string;
  customerHomeUrl: string;
  customerHomeV2Url: string;
}

const DEMO_PROJECT_DEFS: Record<
  string,
  {
    propertyName: string;
    workGenre: string;
    icon: string;
    customerExplanation: string;
    capabilities: string[];
    searchQueries: string[];
    categoryTags: string[];
    knowledgeRefs: Array<{ id: string; kind: string }>;
  }
> = {
  "DEMO-HOME-001": {
    propertyName: "守谷市 山田様邸",
    workGenre: "戸建て防犯設備",
    icon: "🏡",
    customerExplanation:
      "玄関・外周・駐車場を中心に、防犯カメラとセンサーライトで見守りやすい住まいに整えます。設置位置と見える範囲を事前にご確認いただけます。",
    capabilities: [
      "玄関前の来客をカメラで確認",
      "外周の動きをライト連動で見やすく",
      "スマホから映像・通知を確認",
      "夜間の足元まで明るく",
    ],
    searchQueries: ["防犯", "カメラ", "照明"],
    categoryTags: ["防犯", "電気"],
    knowledgeRefs: [
      { id: "PLC-SELF-HOLD-001", kind: "plc" },
      { id: "RP-RP2350-001", kind: "knowledge_card" },
    ],
  },
  "DEMO-FACTORY-001": {
    propertyName: "つくば工場 A棟",
    workGenre: "工場設備",
    icon: "🏭",
    customerExplanation:
      "生産ラインと制御盤の安全回路を見直し、停止・再起動・異常時の動きを分かりやすく説明します。",
    capabilities: [
      "非常停止の確実な動作",
      "ライン連動の安定化",
      "盤内配線の整理とラベル統一",
      "試運転後の確認ポイント共有",
    ],
    searchQueries: ["工場", "PLC", "制御"],
    categoryTags: ["工場", "電気"],
    knowledgeRefs: [{ id: "PLC-SELF-HOLD-001", kind: "plc" }],
  },
  "DEMO-NETWORK-001": {
    propertyName: "守谷市 オフィスビル",
    workGenre: "ネットワーク改善",
    icon: "📶",
    customerExplanation:
      "事務所と通信ラックのLAN配線を整理し、Wi-Fiの届きにくい場所を改善します。速度と安定性のイメージを共有します。",
    capabilities: [
      "Wi-Fi電波の届きにくい場所を改善",
      "有線LANの整理とラベル統一",
      "ルーター・スイッチの設置位置最適化",
      "完了後の接続確認",
    ],
    searchQueries: ["LAN", "ネットワーク", "Wi-Fi"],
    categoryTags: ["ネットワーク"],
    knowledgeRefs: [{ id: "RP-ESP32-001", kind: "knowledge_card" }],
  },
};

function safeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/QNAP|SMB|WebDAV|192\.168\.|filemanager|mock fallback/i.test(url)) return undefined;
  return url;
}

function buildMaterialsForProject(
  ref: string,
  def: (typeof DEMO_PROJECT_DEFS)[string]
): KnowledgeCustomerMaterialItemV1[] {
  const items: KnowledgeCustomerMaterialItemV1[] = [];
  const seen = new Set<string>();

  for (const kref of def.knowledgeRefs) {
    const detail = getKnowledgeCustomerDetailV1(kref.id, kref.kind as never);
    if (!detail) continue;

    for (const photo of detail.photos) {
      const key = `photo:${photo.previewUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `${detail.id}-photo-${items.length}`,
        kind: detail.kind,
        type: "photo",
        title: photo.label || detail.title,
        category: detail.category,
        previewUrl: photo.previewUrl,
        tags: [...def.categoryTags, "写真", detail.category],
        hasPhoto: true,
        hasPdf: false,
        hasPart: false,
        hasExplanation: Boolean(detail.explanation?.simpleDescription),
        detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(detail.id)}&kind=${encodeURIComponent(detail.kind)}&ref=${encodeURIComponent(ref)}`,
      });
    }

    if (detail.explanation?.simpleDescription) {
      items.push({
        id: `${detail.id}-explanation`,
        kind: detail.kind,
        type: "explanation",
        title: detail.explanation.headline || detail.title,
        category: detail.category,
        description: detail.explanation.simpleDescription,
        tags: [...def.categoryTags, detail.category],
        hasPhoto: detail.photos.length > 0,
        hasPdf: detail.pdfs.length > 0,
        hasPart: detail.parts3d.length > 0,
        hasExplanation: true,
        detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(detail.id)}&kind=${encodeURIComponent(detail.kind)}&ref=${encodeURIComponent(ref)}`,
      });
    }

    for (const pdf of detail.pdfs) {
      items.push({
        id: `${detail.id}-pdf-${pdf.label}`,
        kind: detail.kind,
        type: "pdf",
        title: pdf.label,
        category: detail.category,
        viewUrl: pdf.viewUrl,
        tags: [...def.categoryTags, "PDF", detail.category],
        hasPhoto: false,
        hasPdf: true,
        hasPart: false,
        hasExplanation: Boolean(detail.explanation?.simpleDescription),
        detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(detail.id)}&kind=${encodeURIComponent(detail.kind)}&ref=${encodeURIComponent(ref)}`,
      });
    }

    for (const part of detail.parts3d) {
      items.push({
        id: `${detail.id}-part-${part.label}`,
        kind: detail.kind,
        type: "part",
        title: part.label,
        category: detail.category,
        viewUrl: part.viewUrl,
        tags: [...def.categoryTags, "部品", detail.category],
        hasPhoto: false,
        hasPdf: false,
        hasPart: true,
        hasExplanation: Boolean(detail.explanation?.simpleDescription),
        detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(detail.id)}&kind=${encodeURIComponent(detail.kind)}&ref=${encodeURIComponent(ref)}`,
      });
    }

    items.push({
      id: detail.id,
      kind: detail.kind,
      type: "knowledge",
      title: detail.title,
      category: detail.category,
      description: detail.explanation?.simpleDescription,
      tags: [...def.categoryTags, detail.category],
      hasPhoto: detail.photos.length > 0,
      hasPdf: detail.pdfs.length > 0,
      hasPart: detail.parts3d.length > 0,
      hasExplanation: Boolean(detail.explanation?.simpleDescription),
      detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(detail.id)}&kind=${encodeURIComponent(detail.kind)}&ref=${encodeURIComponent(ref)}`,
    });
  }

  items.push({
    id: `${ref}-video-placeholder`,
    kind: "placeholder",
    type: "video",
    title: "設置イメージ動画（準備中）",
    category: def.workGenre,
    description: "施工前後のイメージ動画は順次追加予定です。",
    tags: [...def.categoryTags],
    hasPhoto: false,
    hasPdf: false,
    hasPart: false,
    hasExplanation: true,
    detailUrl: `#materials`,
  });

  const typeOrder: Record<KnowledgeCustomerMaterialItemV1["type"], number> = {
    photo: 1,
    video: 2,
    explanation: 3,
    pdf: 4,
    part: 5,
    knowledge: 6,
  };

  return items.sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.title.localeCompare(b.title, "ja"));
}

export function listCustomerDemoProjectsV1(): KnowledgeCustomerProjectSummaryV1[] {
  return Object.entries(DEMO_PROJECT_DEFS).map(([ref, def]) => ({
    ref,
    propertyName: def.propertyName,
    workGenre: def.workGenre,
    icon: def.icon,
    pageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(ref)}`,
    siteMapUrl: `/knowledge-customer-site-map-v1?ref=${encodeURIComponent(ref)}`,
  }));
}

export function getCustomerProjectPageV1(ref: string): KnowledgeCustomerProjectPageV1 | null {
  const def = DEMO_PROJECT_DEFS[ref.trim()];
  if (!def) return null;

  const relatedKnowledge = def.knowledgeRefs
    .map((kref) => {
      const detail = getKnowledgeCustomerDetailV1(kref.id, kref.kind as never);
      if (!detail) return null;
      return {
        id: detail.id,
        kind: detail.kind,
        title: detail.title,
        category: detail.category,
        detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(detail.id)}&kind=${encodeURIComponent(detail.kind)}&ref=${encodeURIComponent(ref)}`,
      };
    })
    .filter(Boolean) as KnowledgeCustomerProjectPageV1["relatedKnowledge"];

  const relatedPhotos: KnowledgeCustomerProjectPageV1["relatedPhotos"] = [];
  const relatedPdfs: KnowledgeCustomerProjectPageV1["relatedPdfs"] = [];

  for (const k of relatedKnowledge) {
    const detail = getKnowledgeCustomerDetailV1(k.id, k.kind as never);
    if (!detail) continue;
    for (const p of detail.photos) {
      relatedPhotos.push({ label: p.label, previewUrl: safeUrl(p.previewUrl) });
    }
    for (const pdf of detail.pdfs) {
      relatedPdfs.push({ label: pdf.label, viewUrl: safeUrl(pdf.viewUrl) });
    }
  }

  for (const q of def.searchQueries) {
    const hits = unifiedKnowledgeSearchV1({ query: q, limit: 3 }).hits;
    for (const hit of hits) {
      if (relatedKnowledge.some((k) => k.id === hit.id)) continue;
      relatedKnowledge.push({
        id: hit.id,
        kind: hit.kind,
        title: hit.title,
        category: hit.category || "—",
        detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(hit.id)}&kind=${encodeURIComponent(hit.kind)}&ref=${encodeURIComponent(ref)}`,
      });
      if (relatedKnowledge.length >= 6) break;
    }
    if (relatedKnowledge.length >= 6) break;
  }

  const materials = buildMaterialsForProject(ref, def);
  if (!materials.some((m) => m.type === "photo")) {
    materials.unshift({
      id: `${ref}-photo-demo-1`,
      kind: "photo",
      type: "photo",
      title: `${def.propertyName} — 設置イメージ`,
      category: def.workGenre,
      description: "施工イメージ写真（デモ）",
      tags: [...def.categoryTags, "写真"],
      hasPhoto: true,
      hasPdf: false,
      hasPart: false,
      hasExplanation: true,
      detailUrl: relatedKnowledge[0]?.detailUrl || `#materials`,
    });
  }

  return {
    propertyName: def.propertyName,
    workGenre: def.workGenre,
    customerExplanation: def.customerExplanation,
    capabilities: def.capabilities,
    relatedKnowledge,
    relatedPhotos,
    relatedPdfs,
    materials,
    siteMapUrl: `/knowledge-customer-site-map-v1?ref=${encodeURIComponent(ref)}`,
    materialsSectionLabel: "資料一覧",
    customerHomeUrl: "/knowledge-customer-v1",
    customerHomeV2Url: "/knowledge-customer-v2",
  };
}

export function filterCustomerMaterialsV1(
  materials: KnowledgeCustomerMaterialItemV1[],
  filter: string
): KnowledgeCustomerMaterialItemV1[] {
  const f = filter.trim().toLowerCase();
  if (!f || f === "all" || f === "すべて") return materials;

  if (f === "写真" || f === "photo") {
    return materials.filter((m) => m.type === "photo" || m.hasPhoto);
  }
  if (f === "pdf") {
    return materials.filter((m) => m.type === "pdf" || m.hasPdf);
  }
  if (["防犯", "電気", "工場", "ネットワーク"].includes(f)) {
    return materials.filter((m) => m.tags.some((t) => t.toLowerCase().includes(f)) || m.category.includes(f));
  }
  return materials.filter(
    (m) =>
      m.title.toLowerCase().includes(f) ||
      m.category.toLowerCase().includes(f) ||
      m.tags.some((t) => t.toLowerCase().includes(f))
  );
}

export function getSiteAreaKnowledgeLinksV1(
  area: KnowledgeCustomerSiteAreaV1,
  ref: string
): Array<{ id: string; kind: string; title: string; detailUrl: string }> {
  return area.relatedKnowledgeIds.map((k) => ({
    id: k.id,
    kind: k.kind,
    title: getKnowledgeCustomerDetailV1(k.id, k.kind as never)?.title || k.id,
    detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(k.id)}&kind=${encodeURIComponent(k.kind)}&ref=${encodeURIComponent(ref)}`,
  }));
}

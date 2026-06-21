/** Knowledge Customer UI V1/V2/V3 — Site Map 連携（mock · 将来 LiDAR / 3D俯瞰 / 図面連動） */

import {
  getCustomerProjectTemplateKeyV1,
  normalizeCustomerProjectRefV1,
  resolveCustomerProjectMetaV1,
} from "./knowledge-customer-project-adapter-v1.js";
import {
  getCustomerProjectFilesByAreaV1,
  type KnowledgeCustomerProjectFileV1,
} from "./knowledge-customer-project-files-v1.js";
import { getKnowledgeCustomerDetailV1 } from "./knowledge-customer-detail-v1.js";
import { buildCustomerDocumentLinkV1 } from "./knowledge-customer-document-v1.js";
import { filterCustomerProjectFilesForShareV1 } from "./knowledge-customer-share-filter-v1.js";

export type KnowledgeCustomerSiteMapTypeV1 = "2d" | "lidar" | "floorplan" | "threeD";

export interface KnowledgeCustomerMapPointV1 {
  x: number;
  y: number;
  label: string;
}

export interface KnowledgeCustomerMapLineV1 {
  points: KnowledgeCustomerMapPointV1[];
  label: string;
}

export interface KnowledgeCustomerMapPolygonV1 {
  areaId: string;
  points: KnowledgeCustomerMapPointV1[];
}

export interface KnowledgeCustomerSiteMapAssetV1 {
  mapType: KnowledgeCustomerSiteMapTypeV1;
  floorLevel?: number;
  lidarAssetId?: string;
  floorplanAssetId?: string;
  cameraPositions?: KnowledgeCustomerMapPointV1[];
  sensorPositions?: KnowledgeCustomerMapPointV1[];
  routeLines?: KnowledgeCustomerMapLineV1[];
  areaPolygons?: KnowledgeCustomerMapPolygonV1[];
  integrationStatusLabel: string;
  integrationNote: string;
}

export interface KnowledgeCustomerSiteLocationV1 {
  id: string;
  label: string;
  icon: string;
}

export interface KnowledgeCustomerSiteAreaKnowledgeRefV1 {
  id: string;
  kind: string;
}

export interface KnowledgeCustomerSiteAreaV1 {
  areaId: string;
  areaName: string;
  areaType: string;
  icon: string;
  description: string;
  relatedKnowledgeIds: KnowledgeCustomerSiteAreaKnowledgeRefV1[];
  relatedPhotoIds: string[];
  relatedPdfIds: string[];
  customerExplanation: string;
  statusLabel: string;
  equipmentCount: number;
  knowledgeCount: number;
}

export interface KnowledgeCustomerSiteAreaDetailV1 extends KnowledgeCustomerSiteAreaV1 {
  relatedPhotos: Array<{
    fileId: string;
    safeLabel: string;
    previewUrl?: string;
    openUrl?: string;
  }>;
  relatedPdfs: Array<{
    fileId: string;
    safeLabel: string;
    openUrl?: string;
    viewLabel: string;
  }>;
  beforePoints: string[];
  afterPoints: string[];
  customerWarnings: string[];
}

export interface KnowledgeCustomerSiteMapPageV1 {
  propertyName: string;
  workGenre: string;
  customerSafeTitle: string;
  areas: KnowledgeCustomerSiteAreaV1[];
  projectPageUrl: string;
  customerHomeV2Url?: string;
  isFallback?: boolean;
  preparingMessage?: string;
  mapAsset?: KnowledgeCustomerSiteMapAssetV1;
  isShareView?: boolean;
}

function buildMockSiteMapAssetV1(ref: string, areas: KnowledgeCustomerSiteAreaV1[]): KnowledgeCustomerSiteMapAssetV1 {
  const polygons = areas.slice(0, 5).map((area, idx) => ({
    areaId: area.areaId,
    points: [
      { x: 10 + idx * 18, y: 20, label: area.areaName },
      { x: 24 + idx * 18, y: 20, label: "" },
      { x: 24 + idx * 18, y: 40, label: "" },
      { x: 10 + idx * 18, y: 40, label: "" },
    ],
  }));

  return {
    mapType: "2d",
    floorLevel: 1,
    lidarAssetId: `lidar-mock-${ref.replace(/[^\w-]/g, "")}`,
    floorplanAssetId: `floorplan-mock-${ref.replace(/[^\w-]/g, "")}`,
    cameraPositions: [
      { x: 30, y: 25, label: "玄関カメラ" },
      { x: 70, y: 35, label: "外周カメラ" },
    ],
    sensorPositions: [{ x: 55, y: 60, label: "センサーライト" }],
    routeLines: [{ points: [{ x: 20, y: 80, label: "導線" }, { x: 80, y: 80, label: "" }], label: "点検導線" }],
    areaPolygons: polygons,
    integrationStatusLabel: "図面連携準備中",
    integrationNote: "将来の3D・LiDAR・図面アップロード連携に備えたデータ構造です。",
  };
}

const CATEGORY_LOCATIONS: Record<string, KnowledgeCustomerSiteLocationV1[]> = {
  防犯: [
    { id: "entrance", label: "玄関", icon: "🚪" },
    { id: "perimeter", label: "外周", icon: "🏡" },
    { id: "driveway", label: "駐車場", icon: "🚗" },
  ],
  カメラ: [
    { id: "entrance", label: "玄関", icon: "🚪" },
    { id: "perimeter", label: "外周", icon: "🏡" },
  ],
  PLC: [
    { id: "panel", label: "制御盤", icon: "⚙️" },
    { id: "factory-line", label: "工場ライン", icon: "🏭" },
    { id: "breaker", label: "分電盤", icon: "🔌" },
  ],
  工場: [
    { id: "factory-line", label: "工場ライン", icon: "🏭" },
    { id: "panel", label: "制御盤", icon: "⚙️" },
  ],
  ネットワーク: [
    { id: "rack", label: "通信ラック", icon: "📶" },
    { id: "office", label: "事務所", icon: "🏢" },
  ],
  LAN: [
    { id: "rack", label: "通信ラック", icon: "📶" },
    { id: "office", label: "事務所", icon: "🏢" },
  ],
  照明: [
    { id: "entrance", label: "玄関", icon: "🚪" },
    { id: "living", label: "リビング", icon: "💡" },
    { id: "exterior", label: "外構", icon: "🌳" },
  ],
  "3DPrint": [
    { id: "panel", label: "制御盤", icon: "⚙️" },
    { id: "camera-mount", label: "カメラ取付部", icon: "📷" },
  ],
};

const DEFAULT_LOCATIONS: KnowledgeCustomerSiteLocationV1[] = [
  { id: "entrance", label: "玄関", icon: "🚪" },
  { id: "perimeter", label: "外周", icon: "🏡" },
  { id: "breaker", label: "分電盤", icon: "🔌" },
  { id: "factory-line", label: "工場ライン", icon: "🏭" },
  { id: "panel", label: "制御盤", icon: "⚙️" },
];

const PROJECT_SITE_MAPS: Record<
  string,
  {
    propertyName: string;
    workGenre: string;
    areas: KnowledgeCustomerSiteAreaV1[];
  }
> = {
  "DEMO-HOME-001": {
    propertyName: "守谷市 山田様邸",
    workGenre: "戸建て防犯設備",
    areas: [
      {
        areaId: "perimeter",
        areaName: "外周",
        areaType: "exterior",
        icon: "🏡",
        description: "建物の外まわり。カメラとセンサーライトで動きを確認しやすくします。",
        relatedKnowledgeIds: [{ id: "RP-RP2350-001", kind: "knowledge_card" }],
        relatedPhotoIds: ["perimeter-before-1", "perimeter-after-1"],
        relatedPdfIds: ["spec-pdf"],
        customerExplanation: "外周からの来客や荷物の搬入を、ライト連動で見やすくします。",
        statusLabel: "設計済み",
        equipmentCount: 3,
        knowledgeCount: 1,
      },
      {
        areaId: "entrance",
        areaName: "玄関",
        areaType: "entrance",
        icon: "🚪",
        description: "来客確認の要所。カメラで顔や荷物まで確認しやすい位置に設置します。",
        relatedKnowledgeIds: [{ id: "RP-RP2350-001", kind: "knowledge_card" }],
        relatedPhotoIds: ["entrance-before-1", "entrance-after-1"],
        relatedPdfIds: ["manual-camera"],
        customerExplanation: "玄関前の来客を、スマホやモニターで確認できます。",
        statusLabel: "設計済み",
        equipmentCount: 2,
        knowledgeCount: 1,
      },
      {
        areaId: "living",
        areaName: "リビング",
        areaType: "interior",
        icon: "💡",
        description: "室内の明るさと見守りのバランスを整えます。",
        relatedKnowledgeIds: [],
        relatedPhotoIds: [],
        relatedPdfIds: [],
        customerExplanation: "リビング周辺の足元灯で、夜間も安全に移動できます。",
        statusLabel: "検討中",
        equipmentCount: 1,
        knowledgeCount: 0,
      },
      {
        areaId: "breaker",
        areaName: "分電盤",
        areaType: "electrical",
        icon: "🔌",
        description: "電源供給の起点。カメラ・ライト用の回路を整理します。",
        relatedKnowledgeIds: [{ id: "PLC-SELF-HOLD-001", kind: "plc" }],
        relatedPhotoIds: ["breaker-1"],
        relatedPdfIds: ["spec-pdf"],
        customerExplanation: "分電盤から安全に電源を供給し、ラベルで分かりやすく整理します。",
        statusLabel: "設計済み",
        equipmentCount: 2,
        knowledgeCount: 1,
      },
      {
        areaId: "driveway",
        areaName: "駐車場",
        areaType: "exterior",
        icon: "🚗",
        description: "車両の出入りを確認できる位置にカメラを設置します。",
        relatedKnowledgeIds: [],
        relatedPhotoIds: ["driveway-cam-1"],
        relatedPdfIds: [],
        customerExplanation: "駐車場からの出入りも記録・確認できます。",
        statusLabel: "設計済み",
        equipmentCount: 1,
        knowledgeCount: 0,
      },
    ],
  },
  "DEMO-FACTORY-001": {
    propertyName: "つくば工場 A棟",
    workGenre: "工場設備",
    areas: [
      {
        areaId: "factory-line",
        areaName: "工場ライン",
        areaType: "factory",
        icon: "🏭",
        description: "生産ラインの連動と安全停止を整えます。",
        relatedKnowledgeIds: [{ id: "PLC-SELF-HOLD-001", kind: "plc" }],
        relatedPhotoIds: ["line-1"],
        relatedPdfIds: ["factory-line-spec"],
        customerExplanation: "ライン停止・再起動の動きを分かりやすく説明します。",
        statusLabel: "施工中",
        equipmentCount: 4,
        knowledgeCount: 1,
      },
      {
        areaId: "panel",
        areaName: "制御盤",
        areaType: "control",
        icon: "⚙️",
        description: "PLC・リレー・安全回路の中心。",
        relatedKnowledgeIds: [{ id: "PLC-SELF-HOLD-001", kind: "plc" }],
        relatedPhotoIds: ["panel-1"],
        relatedPdfIds: ["panel-manual"],
        customerExplanation: "盤内の配線とラベルを整理し、メンテナンスしやすくします。",
        statusLabel: "設計済み",
        equipmentCount: 3,
        knowledgeCount: 1,
      },
      {
        areaId: "breaker",
        areaName: "分電盤",
        areaType: "electrical",
        icon: "🔌",
        description: "動力・制御回路の電源供給。",
        relatedKnowledgeIds: [],
        relatedPhotoIds: [],
        relatedPdfIds: [],
        customerExplanation: "停電・ロックアウト手順を共有し、安全作業を徹底します。",
        statusLabel: "確認済み",
        equipmentCount: 2,
        knowledgeCount: 0,
      },
    ],
  },
  "DEMO-NETWORK-001": {
    propertyName: "守谷市 オフィスビル",
    workGenre: "ネットワーク改善",
    areas: [
      {
        areaId: "rack",
        areaName: "通信ラック",
        areaType: "network",
        icon: "📶",
        description: "スイッチ・ルーター・配線の中心。",
        relatedKnowledgeIds: [{ id: "RP-ESP32-001", kind: "knowledge_card" }],
        relatedPhotoIds: ["rack-1"],
        relatedPdfIds: ["network-diagram"],
        customerExplanation: "配線とラベルを整理し、障害時の切り分けを容易にします。",
        statusLabel: "設計済み",
        equipmentCount: 5,
        knowledgeCount: 1,
      },
      {
        areaId: "office",
        areaName: "事務所",
        areaType: "office",
        icon: "🏢",
        description: "Wi-Fiの電波が届きにくい席を改善します。",
        relatedKnowledgeIds: [{ id: "RP-ESP32-001", kind: "knowledge_card" }],
        relatedPhotoIds: ["office-ap-1"],
        relatedPdfIds: [],
        customerExplanation: "会議室やデスク周辺の通信品質を改善します。",
        statusLabel: "検討中",
        equipmentCount: 3,
        knowledgeCount: 1,
      },
      {
        areaId: "living",
        areaName: "共用ラウンジ",
        areaType: "common",
        icon: "💡",
        description: "来客・休憩スペースのWi-Fiカバーを拡張します。",
        relatedKnowledgeIds: [],
        relatedPhotoIds: [],
        relatedPdfIds: [],
        customerExplanation: "共用スペースでも安定して通信できるようにします。",
        statusLabel: "計画中",
        equipmentCount: 1,
        knowledgeCount: 0,
      },
    ],
  },
};

function safeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/QNAP|SMB|WebDAV|192\.168\.|filemanager|mock fallback|projectId=/i.test(url)) return undefined;
  return url;
}

function buildAreaBeforeAfter(area: KnowledgeCustomerSiteAreaV1): {
  beforePoints: string[];
  afterPoints: string[];
  customerWarnings: string[];
} {
  if (area.areaType === "electrical" || area.areaName.includes("分電盤")) {
    return {
      beforePoints: ["回路が分かりにくい", "ラベルが不足している"],
      afterPoints: ["専用回路を整理", "ラベルで一目で分かる"],
      customerWarnings: ["ブレーカー操作は専門スタッフにお任せください"],
    };
  }
  if (area.areaType === "entrance" || area.areaName.includes("玄関")) {
    return {
      beforePoints: ["来客確認がしづらい", "夜間が暗い"],
      afterPoints: ["カメラで来客を確認", "ライト連動で明るく"],
      customerWarnings: ["プライバシーに配慮した画角で設置します"],
    };
  }
  if (area.areaType === "factory" || area.areaName.includes("ライン")) {
    return {
      beforePoints: ["停止手順が複雑", "異常時の対応が遅れやすい"],
      afterPoints: ["非常停止が確実", "状態がランプで分かる"],
      customerWarnings: ["試運転時は立入禁止区域を守ってください"],
    };
  }
  return {
    beforePoints: ["確認に時間がかかる", "記録が残りにくい"],
    afterPoints: ["写真と資料で説明しやすい", "施工後も見返せる"],
    customerWarnings: ["設置後は定期的な動作確認をおすすめします"],
  };
}

function enrichAreaFiles(
  ref: string,
  area: KnowledgeCustomerSiteAreaV1,
  shareView = false
): Pick<KnowledgeCustomerSiteAreaDetailV1, "relatedPhotos" | "relatedPdfs"> {
  let areaFiles = getCustomerProjectFilesByAreaV1(ref, area.areaId);
  if (shareView) {
    areaFiles = filterCustomerProjectFilesForShareV1(areaFiles);
  }
  const photoFiles = areaFiles.filter((f) => f.type.includes("photo"));
  const pdfFiles = areaFiles.filter((f) => f.type.includes("pdf") || f.type === "manual_pdf" || f.type === "part_doc");

  const relatedPhotos = photoFiles.map((f) => ({
    fileId: f.fileId,
    safeLabel: f.safeLabel,
    previewUrl: safeUrl(f.previewUrl),
    openUrl: safeUrl(f.openUrl),
  }));

  const relatedPdfs = pdfFiles.map((f) => ({
    fileId: f.fileId,
    safeLabel: f.safeLabel,
    openUrl: safeUrl(buildCustomerDocumentLinkV1(ref, f.fileId, shareView)),
    viewLabel: f.type === "part_doc" ? "資料を確認する" : "PDFを見る",
  }));

  return { relatedPhotos, relatedPdfs };
}

/** カテゴリ・タグから関連場所を推定（mock · V1 互換） */
export function buildCustomerSiteLocationsV1(category: string, tags: string[] = []): KnowledgeCustomerSiteLocationV1[] {
  const haystack = `${category} ${tags.join(" ")}`;
  const found: KnowledgeCustomerSiteLocationV1[] = [];
  const seen = new Set<string>();

  for (const [key, locations] of Object.entries(CATEGORY_LOCATIONS)) {
    if (!haystack.includes(key)) continue;
    for (const loc of locations) {
      if (seen.has(loc.id)) continue;
      seen.add(loc.id);
      found.push(loc);
    }
  }

  if (found.length >= 2) return found.slice(0, 5);
  for (const loc of DEFAULT_LOCATIONS) {
    if (seen.has(loc.id)) continue;
    found.push(loc);
    if (found.length >= 3) break;
  }
  return found;
}

export function getCustomerSiteMapForProjectV1(
  ref: string,
  options?: { shareView?: boolean }
): KnowledgeCustomerSiteMapPageV1 {
  const shareView = Boolean(options?.shareView);
  const normalized = normalizeCustomerProjectRefV1(ref);
  const meta = resolveCustomerProjectMetaV1(normalized);
  const templateKey = meta.templateKey ?? getCustomerProjectTemplateKeyV1(normalized);
  const entry = PROJECT_SITE_MAPS[templateKey] ?? PROJECT_SITE_MAPS["DEMO-HOME-001"];
  const areas = entry.areas.map((a) => ({
    ...a,
    knowledgeCount: a.relatedKnowledgeIds.length,
  }));
  const shareQs = shareView ? "&view=share" : "";

  return {
    propertyName: meta.displayName,
    workGenre: meta.workType || entry.workGenre,
    customerSafeTitle: meta.customerSafeTitle,
    areas,
    projectPageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(normalized)}${shareQs}`,
    customerHomeV2Url: shareView ? undefined : "/knowledge-customer-v2",
    isFallback: meta.isFallback,
    preparingMessage: meta.isFallback ? "配置図を準備中です。" : undefined,
    mapAsset: buildMockSiteMapAssetV1(normalized, areas),
    isShareView: shareView,
  };
}

export function getCustomerSiteAreaV1(ref: string, areaId: string): KnowledgeCustomerSiteAreaV1 | null {
  const map = getCustomerSiteMapForProjectV1(ref);
  return map.areas.find((a) => a.areaId === areaId) ?? null;
}

export function getCustomerSiteAreaDetailV1(
  ref: string,
  areaId: string,
  options?: { shareView?: boolean }
): KnowledgeCustomerSiteAreaDetailV1 | null {
  const area = getCustomerSiteAreaV1(ref, areaId);
  if (!area) return null;

  const normalized = normalizeCustomerProjectRefV1(ref);
  const shareView = Boolean(options?.shareView);
  const fileData = enrichAreaFiles(normalized, area, shareView);
  const ba = buildAreaBeforeAfter(area);

  return {
    ...area,
    ...fileData,
    ...ba,
  };
}

export function listAreaFilesForSiteMapV1(
  ref: string,
  areaId: string
): KnowledgeCustomerProjectFileV1[] {
  return getCustomerProjectFilesByAreaV1(normalizeCustomerProjectRefV1(ref), areaId);
}

export function getSiteAreaKnowledgeDetailV1(
  area: KnowledgeCustomerSiteAreaV1,
  ref: string
): Array<{ id: string; kind: string; title: string; detailUrl: string; summary?: string }> {
  return area.relatedKnowledgeIds.map((k) => {
    const detail = getKnowledgeCustomerDetailV1(k.id, k.kind as never);
    return {
      id: k.id,
      kind: k.kind,
      title: detail?.title || k.id,
      summary: detail?.explanation?.simpleDescription,
      detailUrl: `/knowledge-customer-detail-v1?id=${encodeURIComponent(k.id)}&kind=${encodeURIComponent(k.kind)}&ref=${encodeURIComponent(ref)}`,
    };
  });
}

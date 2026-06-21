/** Knowledge Customer UI V1/V2 — Site Map 連携（mock · 将来 LiDAR / 3D俯瞰 / 図面連動） */

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

export interface KnowledgeCustomerSiteMapPageV1 {
  propertyName: string;
  workGenre: string;
  areas: KnowledgeCustomerSiteAreaV1[];
  projectPageUrl: string;
  customerHomeV2Url: string;
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
        relatedPhotoIds: ["perimeter-cam-1", "perimeter-light-1"],
        relatedPdfIds: ["spec-perimeter"],
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
        relatedPhotoIds: ["entrance-cam-1"],
        relatedPdfIds: ["spec-entrance"],
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
        relatedPhotoIds: ["living-light-1"],
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
        relatedPdfIds: ["spec-electrical"],
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
        relatedPhotoIds: ["breaker-factory-1"],
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

export function getCustomerSiteMapForProjectV1(ref: string): KnowledgeCustomerSiteMapPageV1 | null {
  const entry = PROJECT_SITE_MAPS[ref.trim()];
  if (!entry) return null;
  return {
    propertyName: entry.propertyName,
    workGenre: entry.workGenre,
    areas: entry.areas.map((a) => ({
      ...a,
      knowledgeCount: a.relatedKnowledgeIds.length,
    })),
    projectPageUrl: `/knowledge-customer-project-v1?ref=${encodeURIComponent(ref)}`,
    customerHomeV2Url: "/knowledge-customer-v2",
  };
}

export function getCustomerSiteAreaV1(ref: string, areaId: string): KnowledgeCustomerSiteAreaV1 | null {
  const map = getCustomerSiteMapForProjectV1(ref);
  if (!map) return null;
  return map.areas.find((a) => a.areaId === areaId) ?? null;
}

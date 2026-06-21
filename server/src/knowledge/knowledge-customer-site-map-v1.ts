/** Knowledge Customer UI V1 — Site Map 連携準備（mock、将来図面・3D俯瞰と連動） */

export interface KnowledgeCustomerSiteLocationV1 {
  id: string;
  label: string;
  icon: string;
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

/** カテゴリ・タグから関連場所を推定（mock） */
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

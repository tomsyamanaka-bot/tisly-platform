/** Knowledge Customer UI V3/V4 — 案件メタデータ adapter（mock · PWA business_projects · 将来 QNAP/DB 差し替え） */

import { createRequire } from "module";

export interface KnowledgeCustomerProjectKnowledgeRefV1 {
  id: string;
  kind: string;
}

export interface KnowledgeCustomerProjectMetaV1 {
  ref: string;
  displayName: string;
  city: string;
  customerSafeTitle: string;
  workType: string;
  workSummary: string;
  propertyType: string;
  visitDate: string;
  status: string;
  areas: string[];
  relatedKnowledgeIds: KnowledgeCustomerProjectKnowledgeRefV1[];
  relatedPhotoIds: string[];
  relatedPdfIds: string[];
  customerNotes: string;
  /** 内部: DEMO テンプレートキー（レスポンスには含めない） */
  templateKey?: string;
  /** 内部: ファイル読込用ストレージ ref（レスポンスには含めない） */
  storageRef?: string;
  isFallback?: boolean;
}

const requireModule = createRequire(import.meta.url);

const PRODUCTION_REF_RE = /^([A-Z]{2})-(\d{2})-(\d{4})(?:-(\d{2,3}))?$/;

const CITY_NAMES: Record<string, string> = {
  MO: "守谷市",
  JY: "常総市",
  TM: "つくばみらい市",
  TS: "つくば市",
  TK: "土浦市",
};

const DEMO_REFS = new Set(["DEMO-HOME-001", "DEMO-FACTORY-001", "DEMO-NETWORK-001"]);

/** 本番 ref → デモテンプレ / ストレージ（内部のみ） */
const PRODUCTION_PROFILES: Record<
  string,
  Partial<KnowledgeCustomerProjectMetaV1> & { templateKey: string; storageRef?: string }
> = {
  "MO-26-0709": {
    templateKey: "DEMO-HOME-001",
    storageRef: "MO-26-0616-001",
    displayName: "守谷市 防犯設備工事",
    customerSafeTitle: "守谷市 防犯設備工事",
    city: "守谷市",
    workType: "戸建て防犯設備",
    workSummary: "玄関・外周・駐車場の防犯カメラとセンサーライト工事",
    propertyType: "戸建て",
    visitDate: "2026-07-09",
    status: "施工中",
    areas: ["玄関", "外周", "分電盤", "駐車場", "リビング"],
    relatedKnowledgeIds: [
      { id: "PLC-SELF-HOLD-001", kind: "plc" },
      { id: "RP-RP2350-001", kind: "knowledge_card" },
    ],
    relatedPhotoIds: ["entrance-before-1", "entrance-after-1", "perimeter-before-1", "breaker-1"],
    relatedPdfIds: ["spec-pdf", "completion-pdf", "estimate-pdf"],
    customerNotes: "施工前後の写真と仕様書・完了報告書をご確認いただけます。",
  },
  "MO-26-0709-01": {
    templateKey: "DEMO-HOME-001",
    storageRef: "MO-26-0617-001",
    displayName: "守谷市 防犯設備工事（2件目）",
    customerSafeTitle: "守谷市 防犯設備工事",
    city: "守谷市",
    workType: "戸建て防犯設備",
    workSummary: "別棟の外周カメラ追加工事",
    propertyType: "戸建て",
    visitDate: "2026-07-09",
    status: "見積提示",
    areas: ["外周", "玄関", "分電盤"],
    relatedKnowledgeIds: [{ id: "RP-RP2350-001", kind: "knowledge_card" }],
    relatedPhotoIds: ["perimeter-before-1"],
    relatedPdfIds: ["spec-pdf", "estimate-pdf"],
    customerNotes: "外周カメラ追加のご提案資料です。",
  },
  "TK-26-0710": {
    templateKey: "DEMO-NETWORK-001",
    displayName: "土浦市 ネットワーク改善",
    customerSafeTitle: "土浦市 ネットワーク改善",
    city: "土浦市",
    workType: "ネットワーク改善",
    workSummary: "事務所LANとWi-Fiの整理・改善",
    propertyType: "オフィス",
    visitDate: "2026-07-10",
    status: "設計中",
    areas: ["通信ラック", "事務所"],
    relatedKnowledgeIds: [{ id: "RP-ESP32-001", kind: "knowledge_card" }],
    relatedPhotoIds: ["rack-1"],
    relatedPdfIds: [],
    customerNotes: "通信環境改善の説明資料です。",
  },
  "JY-26-0711": {
    templateKey: "DEMO-FACTORY-001",
    displayName: "常総市 工場設備工事",
    customerSafeTitle: "常総市 工場設備工事",
    city: "常総市",
    workType: "工場設備",
    workSummary: "生産ライン制御盤の安全回路見直し",
    propertyType: "工場",
    visitDate: "2026-07-11",
    status: "試運転",
    areas: ["工場ライン", "制御盤", "分電盤"],
    relatedKnowledgeIds: [{ id: "PLC-SELF-HOLD-001", kind: "plc" }],
    relatedPhotoIds: ["line-1", "panel-1"],
    relatedPdfIds: ["factory-line-spec"],
    customerNotes: "安全停止と再起動手順の説明資料です。",
  },
};

const DEMO_META: Record<string, Omit<KnowledgeCustomerProjectMetaV1, "ref">> = {
  "DEMO-HOME-001": {
    displayName: "守谷市 山田様邸",
    city: "守谷市",
    customerSafeTitle: "守谷市 戸建て防犯設備",
    workType: "戸建て防犯設備",
    workSummary: "玄関・外周・駐車場の防犯カメラとセンサーライト",
    propertyType: "戸建て",
    visitDate: "2026-06-01",
    status: "デモ",
    areas: ["玄関", "外周", "分電盤", "駐車場", "リビング"],
    relatedKnowledgeIds: [
      { id: "PLC-SELF-HOLD-001", kind: "plc" },
      { id: "RP-RP2350-001", kind: "knowledge_card" },
    ],
    relatedPhotoIds: ["entrance-cam-1", "perimeter-cam-1", "breaker-1"],
    relatedPdfIds: ["spec-entrance", "spec-electrical"],
    customerNotes: "営業・現調説明用のデモ物件です。",
    templateKey: "DEMO-HOME-001",
  },
  "DEMO-FACTORY-001": {
    displayName: "つくば工場 A棟",
    city: "つくば市",
    customerSafeTitle: "工場設備工事",
    workType: "工場設備",
    workSummary: "生産ラインと制御盤の安全回路",
    propertyType: "工場",
    visitDate: "2026-06-01",
    status: "デモ",
    areas: ["工場ライン", "制御盤", "分電盤"],
    relatedKnowledgeIds: [{ id: "PLC-SELF-HOLD-001", kind: "plc" }],
    relatedPhotoIds: ["line-1", "panel-1"],
    relatedPdfIds: ["factory-line-spec", "panel-manual"],
    customerNotes: "工場設備説明用デモです。",
    templateKey: "DEMO-FACTORY-001",
  },
  "DEMO-NETWORK-001": {
    displayName: "守谷市 オフィスビル",
    city: "守谷市",
    customerSafeTitle: "ネットワーク改善",
    workType: "ネットワーク改善",
    workSummary: "LAN配線整理とWi-Fi改善",
    propertyType: "オフィス",
    visitDate: "2026-06-01",
    status: "デモ",
    areas: ["通信ラック", "事務所", "共用ラウンジ"],
    relatedKnowledgeIds: [{ id: "RP-ESP32-001", kind: "knowledge_card" }],
    relatedPhotoIds: ["rack-1", "office-ap-1"],
    relatedPdfIds: ["network-diagram"],
    customerNotes: "ネットワーク改善説明用デモです。",
    templateKey: "DEMO-NETWORK-001",
  },
};

export function isProductionProjectRefV1(ref: string): boolean {
  return PRODUCTION_REF_RE.test(ref.trim());
}

export function parseProductionProjectRefV1(ref: string): {
  cityCode: string;
  yy: string;
  mmdd: string;
  suffix?: string;
} | null {
  const m = ref.trim().match(PRODUCTION_REF_RE);
  if (!m) return null;
  return { cityCode: m[1], yy: m[2], mmdd: m[3], suffix: m[4] };
}

export function getCityNameFromCodeV1(cityCode: string): string {
  return CITY_NAMES[cityCode.toUpperCase()] ?? `${cityCode}エリア`;
}

function formatVisitDateFromMmdd(yy: string, mmdd: string): string {
  const mm = mmdd.slice(0, 2);
  const dd = mmdd.slice(2, 4);
  return `20${yy}-${mm}-${dd}`;
}

function inferWorkTypeFromCity(cityCode: string): string {
  if (cityCode === "JY") return "工場設備";
  return "防犯設備工事";
}

function buildFallbackMeta(ref: string): KnowledgeCustomerProjectMetaV1 {
  const parsed = parseProductionProjectRefV1(ref);
  const city = parsed ? getCityNameFromCodeV1(parsed.cityCode) : "現場";
  const workType = parsed ? inferWorkTypeFromCity(parsed.cityCode) : "設備工事";
  const visitDate = parsed ? formatVisitDateFromMmdd(parsed.yy, parsed.mmdd) : "";
  const templateKey =
    workType.includes("工場") ? "DEMO-FACTORY-001" : workType.includes("ネットワーク") ? "DEMO-NETWORK-001" : "DEMO-HOME-001";

  return {
    ref: ref.trim(),
    displayName: `${city} ${workType}`,
    city,
    customerSafeTitle: `${city} ${workType}`,
    workType,
    workSummary: `${city}での${workType}に関する資料をご確認いただけます。`,
    propertyType: "—",
    visitDate,
    status: "資料準備中",
    areas: ["玄関", "外周", "分電盤"],
    relatedKnowledgeIds: [{ id: "RP-RP2350-001", kind: "knowledge_card" }],
    relatedPhotoIds: [],
    relatedPdfIds: [],
    customerNotes: "資料を順次追加しております。",
    templateKey,
    isFallback: true,
  };
}

export function normalizeCustomerProjectRefV1(ref: string): string {
  const trimmed = ref.trim();
  if (DEMO_REFS.has(trimmed)) return trimmed;
  const parsed = parseProductionProjectRefV1(trimmed.toUpperCase());
  if (!parsed) return trimmed;
  const suffix = parsed.suffix ? `-${parsed.suffix}` : "";
  return `${parsed.cityCode}-${parsed.yy}-${parsed.mmdd}${suffix}`;
}

export function resolveCustomerProjectMetaV1(ref: string): KnowledgeCustomerProjectMetaV1 {
  const normalized = normalizeCustomerProjectRefV1(ref);

  try {
    const fromBusiness = tryResolveCustomerMetaFromBusinessProjects(normalized);
    if (fromBusiness) return fromBusiness;
  } catch {
    /* business_projects unavailable — mock fallback */
  }

  if (DEMO_META[normalized]) {
    return { ref: normalized, ...DEMO_META[normalized] };
  }

  const profile = PRODUCTION_PROFILES[normalized];
  if (profile) {
    const { templateKey, storageRef, ...rest } = profile;
    return {
      ref: normalized,
      displayName: rest.displayName ?? `${rest.city ?? "現場"} ${rest.workType ?? "設備工事"}`,
      city: rest.city ?? "守谷市",
      customerSafeTitle: rest.customerSafeTitle ?? rest.displayName ?? "設備工事",
      workType: rest.workType ?? "設備工事",
      workSummary: rest.workSummary ?? "",
      propertyType: rest.propertyType ?? "—",
      visitDate: rest.visitDate ?? "",
      status: rest.status ?? "進行中",
      areas: rest.areas ?? [],
      relatedKnowledgeIds: rest.relatedKnowledgeIds ?? [],
      relatedPhotoIds: rest.relatedPhotoIds ?? [],
      relatedPdfIds: rest.relatedPdfIds ?? [],
      customerNotes: rest.customerNotes ?? "",
      templateKey,
      storageRef,
    };
  }

  if (isProductionProjectRefV1(normalized)) {
    const parsed = parseProductionProjectRefV1(normalized)!;
    const city = getCityNameFromCodeV1(parsed.cityCode);
    const workType = inferWorkTypeFromCity(parsed.cityCode);
    const templateKey =
      workType.includes("工場") ? "DEMO-FACTORY-001" : "DEMO-HOME-001";

    return {
      ref: normalized,
      displayName: `${city} ${workType}`,
      city,
      customerSafeTitle: `${city} ${workType}`,
      workType,
      workSummary: `${city}での${workType}`,
      propertyType: "—",
      visitDate: formatVisitDateFromMmdd(parsed.yy, parsed.mmdd),
      status: "進行中",
      areas: ["玄関", "外周", "分電盤"],
      relatedKnowledgeIds: [{ id: "RP-RP2350-001", kind: "knowledge_card" }],
      relatedPhotoIds: [],
      relatedPdfIds: [],
      customerNotes: "関連資料を順次追加しております。",
      templateKey,
      storageRef: normalized,
      isFallback: false,
    };
  }

  return buildFallbackMeta(normalized);
}

function tryResolveCustomerMetaFromBusinessProjects(
  ref: string
): KnowledgeCustomerProjectMetaV1 | null {
  const mod = requireModule("./knowledge-business-projects-adapter-v1.js") as {
    tryResolveCustomerMetaFromBusinessProjectsV1: (r: string) => KnowledgeCustomerProjectMetaV1 | null;
  };
  return mod.tryResolveCustomerMetaFromBusinessProjectsV1(ref);
}

/** API レスポンス用 — 内部フィールドを除外 */
export function sanitizeCustomerProjectMetaV1(
  meta: KnowledgeCustomerProjectMetaV1
): Omit<KnowledgeCustomerProjectMetaV1, "templateKey" | "storageRef"> {
  const { templateKey: _t, storageRef: _s, ...safe } = meta;
  return safe;
}

export function getCustomerProjectTemplateKeyV1(ref: string): string {
  return resolveCustomerProjectMetaV1(ref).templateKey ?? "DEMO-HOME-001";
}

export function getCustomerProjectStorageRefV1(ref: string): string | undefined {
  const meta = resolveCustomerProjectMetaV1(ref);
  return meta.storageRef ?? (isProductionProjectRefV1(meta.ref) ? meta.ref : undefined);
}

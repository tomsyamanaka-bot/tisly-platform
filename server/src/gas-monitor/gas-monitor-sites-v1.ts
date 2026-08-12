/**
 * TiSLY ガス見守り — 物件カタログ
 * 既存配列は触らず末尾追記のみ
 * JP/AU · tenant_id を意識した構造
 */

export type GasPropertyKindV1 =
  | "detached"
  | "apartment"
  | "shop";

export type GasCountryCodeV1 = "JP" | "AU";

export type GasCurrencyV1 = "JPY" | "AUD";

export interface GasCylinderV1 {
  /** 1本目 / 2本目 */
  index: 1 | 2;
  capacityKg: number;
  remainingKg: number;
  /** 自動切替中か */
  active: boolean;
}

export interface GasPropertyV1 {
  id: string;
  tenantId: string;
  countryCode: GasCountryCodeV1;
  currency: GasCurrencyV1;
  kind: GasPropertyKindV1;
  /** 表示名（お客様向け） */
  displayName: string;
  addressLabel: string;
  /** 積算パルス（自動検針） */
  meterPulseTotal: number;
  /** 当日使用量 m3 */
  todayUsageM3: number;
  /** 緊急遮断中 */
  emergencyShutoff: boolean;
  cylinders: GasCylinderV1[];
  /** 生活見守りテキスト */
  lifeWatchNotes: string[];
  /** 当日時間別使用量（グラフ） */
  hourlyUsageM3: number[];
}

/** 既定物件（戸建てデモ） */
export const GAS_MONITOR_DEFAULT_PROPERTY_ID_V1 =
  "GAS-JP-HOME-001";

/**
 * サンプル物件
 * 戸建て・アパート複数世帯・店舗
 */
export const GAS_MONITOR_PROPERTIES_V1: readonly GasPropertyV1[] = [
  {
    id: "GAS-JP-HOME-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "detached",
    displayName: "守谷 山田邸（戸建て）",
    addressLabel: "茨城県守谷市",
    meterPulseTotal: 184520,
    todayUsageM3: 1.24,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 50, remainingKg: 32.5, active: true },
      { index: 2, capacityKg: 50, remainingKg: 48.0, active: false },
    ],
    lifeWatchNotes: [
      "今朝07:15にお湯の使用を確認",
      "昨夜22:40にコンロ使用を確認",
    ],
    hourlyUsageM3: [
      0.02, 0.01, 0.0, 0.0, 0.0, 0.01, 0.08, 0.22, 0.15, 0.06, 0.04,
      0.05, 0.07, 0.04, 0.03, 0.05, 0.09, 0.18, 0.12, 0.06, 0.04, 0.02,
      0.01, 0.0,
    ],
  },
  {
    id: "GAS-JP-APT-201",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "apartment",
    displayName: "つくばコーポ 201号室",
    addressLabel: "茨城県つくば市",
    meterPulseTotal: 91240,
    todayUsageM3: 0.86,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 30, remainingKg: 5.4, active: true },
      { index: 2, capacityKg: 30, remainingKg: 28.2, active: false },
    ],
    lifeWatchNotes: [
      "今朝06:50にお湯の使用を確認",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.02, 0.14, 0.11, 0.05, 0.03, 0.02,
      0.04, 0.06, 0.03, 0.02, 0.04, 0.07, 0.12, 0.08, 0.03, 0.02, 0.01,
      0.0, 0.0,
    ],
  },
  {
    id: "GAS-JP-APT-305",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "apartment",
    displayName: "つくばコーポ 305号室",
    addressLabel: "茨城県つくば市",
    meterPulseTotal: 77810,
    todayUsageM3: 0.41,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 30, remainingKg: 18.0, active: true },
      { index: 2, capacityKg: 30, remainingKg: 29.5, active: false },
    ],
    lifeWatchNotes: [
      "今朝08:05にコンロ使用を確認",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.02, 0.08, 0.05, 0.02, 0.01,
      0.02, 0.03, 0.02, 0.01, 0.02, 0.03, 0.06, 0.04, 0.01, 0.0, 0.0,
      0.0, 0.0,
    ],
  },
  {
    id: "GAS-JP-SHOP-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "shop",
    displayName: "土浦キッチン 店舗",
    addressLabel: "茨城県土浦市",
    meterPulseTotal: 402180,
    todayUsageM3: 4.62,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 50, remainingKg: 8.0, active: false },
      { index: 2, capacityKg: 50, remainingKg: 41.5, active: true },
    ],
    lifeWatchNotes: [
      "本日11:20に厨房使用を確認",
      "ボンベ自動切替を検知（1本目→2本目）",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.12, 0.28, 0.35, 0.42, 0.48,
      0.55, 0.4, 0.22, 0.18, 0.25, 0.3, 0.38, 0.2, 0.08, 0.04, 0.0,
      0.0, 0.0,
    ],
  },
  {
    id: "GAS-JP-HOME-ALERT",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "detached",
    displayName: "取手 佐藤邸（デモ警報）",
    addressLabel: "茨城県取手市",
    meterPulseTotal: 156020,
    todayUsageM3: 0.12,
    emergencyShutoff: true,
    cylinders: [
      { index: 1, capacityKg: 50, remainingKg: 22.0, active: true },
      { index: 2, capacityKg: 50, remainingKg: 45.0, active: false },
    ],
    lifeWatchNotes: [
      "緊急遮断が作動しました",
      "ガス会社へ自動通知済み（デモ）",
    ],
    hourlyUsageM3: [
      0.01, 0.01, 0.0, 0.0, 0.0, 0.02, 0.04, 0.02, 0.01, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    ],
  },
  // AU 展開サンプル（追記）
  {
    id: "GAS-AU-HOME-001",
    tenantId: "tenant_demo_au",
    countryCode: "AU",
    currency: "AUD",
    kind: "detached",
    displayName: "Sydney Demo Home",
    addressLabel: "NSW, Australia",
    meterPulseTotal: 22040,
    todayUsageM3: 0.95,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 45, remainingKg: 20.0, active: true },
      { index: 2, capacityKg: 45, remainingKg: 40.0, active: false },
    ],
    lifeWatchNotes: [
      "Hot water usage confirmed at 07:30",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.02, 0.1, 0.18, 0.08, 0.04, 0.03,
      0.04, 0.05, 0.03, 0.02, 0.04, 0.06, 0.12, 0.08, 0.03, 0.02, 0.01,
      0.0, 0.0,
    ],
  },
  // --- 以下 Life Care / 建物グループ拡張（追記のみ） ---
  {
    id: "GAS-JP-APT-102",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "apartment",
    displayName: "つくばコーポ 102号室",
    addressLabel: "茨城県つくば市",
    meterPulseTotal: 65420,
    todayUsageM3: 0.72,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 30, remainingKg: 22.0, active: true },
      { index: 2, capacityKg: 30, remainingKg: 29.0, active: false },
    ],
    lifeWatchNotes: [
      "今朝07:50にお湯の使用を確認",
      "ミリ波: リビングで生活反応あり",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.1, 0.12, 0.06, 0.03, 0.02,
      0.03, 0.05, 0.03, 0.02, 0.03, 0.06, 0.1, 0.07, 0.02, 0.01, 0.0,
      0.0, 0.0,
    ],
  },
  {
    id: "GAS-JP-APT-403",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "apartment",
    displayName: "つくばコーポ 403号室",
    addressLabel: "茨城県つくば市",
    meterPulseTotal: 88110,
    todayUsageM3: 0.18,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 30, remainingKg: 14.5, active: true },
      { index: 2, capacityKg: 30, remainingKg: 28.0, active: false },
    ],
    lifeWatchNotes: [
      "浴室ゾーンに長時間滞留を検知",
      "ご家族・事業者へ通知準備中（デモ）",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.02, 0.06, 0.02, 0.01, 0.0, 0.0,
      0.01, 0.01, 0.01, 0.0, 0.01, 0.01, 0.02, 0.01, 0.0, 0.0, 0.0,
      0.0, 0.0,
    ],
  },
  {
    id: "GAS-AU-APT-12A",
    tenantId: "tenant_demo_au",
    countryCode: "AU",
    currency: "AUD",
    kind: "apartment",
    displayName: "Melbourne Harbour 12A",
    addressLabel: "VIC, Australia",
    meterPulseTotal: 15480,
    todayUsageM3: 0.0,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 45, remainingKg: 30.0, active: true },
      { index: 2, capacityKg: 45, remainingKg: 42.0, active: false },
    ],
    lifeWatchNotes: [
      "No gas pulse detected for 24 hours",
      "mmWave: no presence in unit",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    ],
  },
  {
    id: "GAS-AU-APT-12B",
    tenantId: "tenant_demo_au",
    countryCode: "AU",
    currency: "AUD",
    kind: "apartment",
    displayName: "Melbourne Harbour 12B",
    addressLabel: "VIC, Australia",
    meterPulseTotal: 18920,
    todayUsageM3: 0.64,
    emergencyShutoff: false,
    cylinders: [
      { index: 1, capacityKg: 45, remainingKg: 18.0, active: true },
      { index: 2, capacityKg: 45, remainingKg: 40.0, active: false },
    ],
    lifeWatchNotes: [
      "Cooking gas confirmed at 08:15",
    ],
    hourlyUsageM3: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.01, 0.08, 0.14, 0.06, 0.03, 0.02,
      0.03, 0.04, 0.02, 0.02, 0.03, 0.05, 0.08, 0.05, 0.02, 0.01, 0.0,
      0.0, 0.0,
    ],
  },
];

export function findGasPropertyV1(
  id: string | null | undefined
): GasPropertyV1 {
  const key = String(id || "").trim();
  const found = GAS_MONITOR_PROPERTIES_V1.find((p) => p.id === key);
  if (found) return found;
  return (
    GAS_MONITOR_PROPERTIES_V1.find(
      (p) => p.id === GAS_MONITOR_DEFAULT_PROPERTY_ID_V1
    ) || GAS_MONITOR_PROPERTIES_V1[0]
  );
}

export function listGasPropertiesV1(): GasPropertyV1[] {
  return [...GAS_MONITOR_PROPERTIES_V1];
}

/** 残量 %（0〜100） */
export function cylinderPercentV1(c: GasCylinderV1): number {
  if (c.capacityKg <= 0) return 0;
  const pct = (c.remainingKg / c.capacityKg) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

/** 要配送判定（20%以下 or 自動切替直後） */
export function needsDeliveryV1(p: GasPropertyV1): boolean {
  const low = p.cylinders.some((c) => cylinderPercentV1(c) <= 20);
  const switched =
    p.lifeWatchNotes.some((n) => n.includes("自動切替")) ||
    (p.cylinders.some((c) => c.index === 1 && !c.active) &&
      p.cylinders.some((c) => c.index === 2 && c.active) &&
      p.cylinders.some((c) => c.index === 1 && cylinderPercentV1(c) <= 20));
  return low || switched;
}

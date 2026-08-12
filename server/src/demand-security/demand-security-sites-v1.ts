/**
 * TiSLY 電気デマンド＆セキュリティ
 * 物件カタログ（JP/AU · tenant_id）
 * 既存配列は触らず末尾追記のみ
 */

export type DemandCountryCodeV1 = "JP" | "AU";
export type DemandCurrencyV1 = "JPY" | "AUD";

export type DemandSiteKindV1 =
  | "home"
  | "shop"
  | "factory";

export type DemandDoorStateV1 =
  | "locked"
  | "unlocked"
  | "open";

export type DemandMotionStateV1 =
  | "clear"
  | "detected";

export interface DemandRelayChannelV1 {
  id: string;
  /** 表示名 */
  label: string;
  /** 100V / 200V */
  voltage: 100 | 200;
  /** ON=通電 */
  on: boolean;
  /** ピークカット対象か */
  peakCutEnabled: boolean;
}

export interface DemandSiteV1 {
  id: string;
  tenantId: string;
  countryCode: DemandCountryCodeV1;
  currency: DemandCurrencyV1;
  kind: DemandSiteKindV1;
  displayName: string;
  addressLabel: string;
  /** 主幹電流 A（リアルタイム） */
  mainCurrentA: number;
  /** 契約デマンド kW */
  contractDemandKw: number;
  /** 現在デマンド kW */
  currentDemandKw: number;
  /** ピークカット作動中 */
  peakCutActive: boolean;
  /** 施錠 / 解錠 / 開 */
  doorState: DemandDoorStateV1;
  /** 人感 */
  motionState: DemandMotionStateV1;
  relays: DemandRelayChannelV1[];
  /** 当日時間別電流 A */
  hourlyCurrentA: number[];
  notes: string[];
}

export const DEMAND_SECURITY_DEFAULT_SITE_ID_V1 =
  "DEMAND-JP-HOME-001";

/**
 * サンプル物件
 * 戸建て・店舗・工場 · JP/AU
 */
export const DEMAND_SECURITY_SITES_V1: DemandSiteV1[] = [
  {
    id: "DEMAND-JP-HOME-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "home",
    displayName: "守谷 山田邸（戸建て）",
    addressLabel: "茨城県守谷市",
    mainCurrentA: 28.4,
    contractDemandKw: 8,
    currentDemandKw: 5.2,
    peakCutActive: false,
    doorState: "locked",
    motionState: "clear",
    relays: [
      {
        id: "r1",
        label: "給湯器（100V）",
        voltage: 100,
        on: true,
        peakCutEnabled: true,
      },
      {
        id: "r2",
        label: "EV充電器（200V）",
        voltage: 200,
        on: false,
        peakCutEnabled: true,
      },
    ],
    hourlyCurrentA: [
      12, 11, 10, 10, 11, 14, 22, 31, 28, 24, 20, 18, 19, 17, 16,
      18, 22, 30, 34, 29, 24, 18, 15, 13,
    ],
    notes: [
      "玄関は施錠されています",
      "人感センサーは正常です",
    ],
  },
  {
    id: "DEMAND-JP-SHOP-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "shop",
    displayName: "土浦 店舗デモ",
    addressLabel: "茨城県土浦市",
    mainCurrentA: 62.1,
    contractDemandKw: 30,
    currentDemandKw: 24.8,
    peakCutActive: true,
    doorState: "unlocked",
    motionState: "detected",
    relays: [
      {
        id: "r1",
        label: "空調A（200V）",
        voltage: 200,
        on: false,
        peakCutEnabled: true,
      },
      {
        id: "r2",
        label: "照明盤（100V）",
        voltage: 100,
        on: true,
        peakCutEnabled: false,
      },
      {
        id: "r3",
        label: "ショーケース（100V）",
        voltage: 100,
        on: true,
        peakCutEnabled: true,
      },
    ],
    hourlyCurrentA: [
      18, 16, 15, 15, 16, 22, 35, 48, 55, 58, 60, 62, 58, 52, 48,
      50, 54, 57, 45, 30, 24, 20, 18, 17,
    ],
    notes: [
      "ピークカット作動中（空調を一時停止）",
      "店内で人感を検知しています",
    ],
  },
  {
    id: "DEMAND-JP-FACTORY-001",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "factory",
    displayName: "つくば 工場ライン",
    addressLabel: "茨城県つくば市",
    mainCurrentA: 118.5,
    contractDemandKw: 75,
    currentDemandKw: 71.2,
    peakCutActive: true,
    doorState: "locked",
    motionState: "clear",
    relays: [
      {
        id: "r1",
        label: "コンベア（200V）",
        voltage: 200,
        on: true,
        peakCutEnabled: true,
      },
      {
        id: "r2",
        label: "コンプレッサ（200V）",
        voltage: 200,
        on: false,
        peakCutEnabled: true,
      },
      {
        id: "r3",
        label: "事務所照明（100V）",
        voltage: 100,
        on: true,
        peakCutEnabled: false,
      },
    ],
    hourlyCurrentA: [
      40, 38, 36, 35, 38, 55, 80, 95, 110, 115, 118, 112, 108, 100,
      98, 105, 112, 108, 90, 70, 55, 48, 44, 42,
    ],
    notes: [
      "契約デマンド接近のため自動セーブ中",
      "外周ドアは施錠済み",
    ],
  },
  {
    id: "DEMAND-JP-HOME-ALERT",
    tenantId: "tenant_toms_jp",
    countryCode: "JP",
    currency: "JPY",
    kind: "home",
    displayName: "取手 佐藤邸（警報デモ）",
    addressLabel: "茨城県取手市",
    mainCurrentA: 9.2,
    contractDemandKw: 6,
    currentDemandKw: 1.8,
    peakCutActive: false,
    doorState: "open",
    motionState: "detected",
    relays: [
      {
        id: "r1",
        label: "玄関灯（100V）",
        voltage: 100,
        on: true,
        peakCutEnabled: false,
      },
      {
        id: "r2",
        label: "エアコン（200V）",
        voltage: 200,
        on: false,
        peakCutEnabled: true,
      },
    ],
    hourlyCurrentA: [
      8, 7, 7, 6, 7, 9, 12, 10, 9, 8, 8, 9, 9, 8, 8, 9, 10, 11, 10,
      9, 9, 8, 8, 8,
    ],
    notes: [
      "玄関が開いています",
      "人感センサーが反応しています",
    ],
  },
  // AU 展開サンプル（追記）
  {
    id: "DEMAND-AU-HOME-001",
    tenantId: "tenant_demo_au",
    countryCode: "AU",
    currency: "AUD",
    kind: "home",
    displayName: "Sydney Demo Home",
    addressLabel: "NSW, Australia",
    mainCurrentA: 22.0,
    contractDemandKw: 10,
    currentDemandKw: 4.1,
    peakCutActive: false,
    doorState: "locked",
    motionState: "clear",
    relays: [
      {
        id: "r1",
        label: "Hot water (240V≈200V class)",
        voltage: 200,
        on: true,
        peakCutEnabled: true,
      },
      {
        id: "r2",
        label: "Pool pump (240V)",
        voltage: 200,
        on: false,
        peakCutEnabled: true,
      },
    ],
    hourlyCurrentA: [
      10, 9, 9, 8, 9, 12, 18, 24, 22, 18, 16, 15, 16, 14, 13, 15,
      18, 26, 24, 18, 14, 12, 11, 10,
    ],
    notes: [
      "Front door is locked",
      "No motion detected",
    ],
  },
];

export function findDemandSiteV1(
  id: string | null | undefined
): DemandSiteV1 {
  const key = String(id || "").trim();
  const found = DEMAND_SECURITY_SITES_V1.find((s) => s.id === key);
  if (found) return found;
  return (
    DEMAND_SECURITY_SITES_V1.find(
      (s) => s.id === DEMAND_SECURITY_DEFAULT_SITE_ID_V1
    ) || DEMAND_SECURITY_SITES_V1[0]
  );
}

export function listDemandSitesV1(): DemandSiteV1[] {
  return [...DEMAND_SECURITY_SITES_V1];
}

/** デマンド使用率（%） */
export function demandUsagePercentV1(s: DemandSiteV1): number {
  if (s.contractDemandKw <= 0) return 0;
  const pct =
    (s.currentDemandKw / s.contractDemandKw) * 100;
  return Math.max(0, Math.min(200, Math.round(pct * 10) / 10));
}

/** セキュリティ要確認 */
export function securityNeedsAttentionV1(s: DemandSiteV1): boolean {
  return s.doorState === "open" || s.motionState === "detected";
}

/**
 * リレー操作（モック）
 * 既存サイト配列を破壊せず対象のみ更新
 */
export function setDemandRelayStateV1(
  siteId: string,
  relayId: string,
  on: boolean
): DemandSiteV1 | null {
  const site = DEMAND_SECURITY_SITES_V1.find((s) => s.id === siteId);
  if (!site) return null;
  const relay = site.relays.find((r) => r.id === relayId);
  if (!relay) return null;
  relay.on = Boolean(on);
  return site;
}

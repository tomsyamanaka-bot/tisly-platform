/**
 * ガス監視 — 建物（アパート等）グループ定義
 * 既存フラット物件は非破壊のまま ID 参照で束ねる
 */

import type {
  GasCountryCodeV1,
  GasCurrencyV1,
  GasPropertyKindV1,
} from "./gas-monitor-sites-v1.js";

export interface GasBuildingDefV1 {
  buildingId: string;
  buildingName: string;
  addressLabel: string;
  kind: GasPropertyKindV1;
  countryCode: GasCountryCodeV1;
  currency: GasCurrencyV1;
  tenantId: string;
  /** 部屋・世帯の物件 ID 一覧 */
  propertyIds: readonly string[];
}

/**
 * 建物カタログ
 * フラット物件を建物単位でグループ化
 */
export const GAS_MONITOR_BUILDINGS_V1: readonly GasBuildingDefV1[] = [
  {
    buildingId: "BLD-JP-MORIYA-YAMADA",
    buildingName: "守谷 山田邸",
    addressLabel: "茨城県守谷市",
    kind: "detached",
    countryCode: "JP",
    currency: "JPY",
    tenantId: "tenant_toms_jp",
    propertyIds: ["GAS-JP-HOME-001"],
  },
  {
    buildingId: "BLD-JP-TSUKUBA-CORPO",
    buildingName: "つくばコーポ",
    addressLabel: "茨城県つくば市",
    kind: "apartment",
    countryCode: "JP",
    currency: "JPY",
    tenantId: "tenant_toms_jp",
    propertyIds: [
      "GAS-JP-APT-102",
      "GAS-JP-APT-201",
      "GAS-JP-APT-305",
      "GAS-JP-APT-403",
    ],
  },
  {
    buildingId: "BLD-JP-TSUCHIURA-KITCHEN",
    buildingName: "土浦キッチン",
    addressLabel: "茨城県土浦市",
    kind: "shop",
    countryCode: "JP",
    currency: "JPY",
    tenantId: "tenant_toms_jp",
    propertyIds: ["GAS-JP-SHOP-001"],
  },
  {
    buildingId: "BLD-JP-TORIDE-SATO",
    buildingName: "取手 佐藤邸（デモ警報）",
    addressLabel: "茨城県取手市",
    kind: "detached",
    countryCode: "JP",
    currency: "JPY",
    tenantId: "tenant_toms_jp",
    propertyIds: ["GAS-JP-HOME-ALERT"],
  },
  {
    buildingId: "BLD-AU-SYDNEY-DEMO",
    buildingName: "Sydney Demo Home",
    addressLabel: "NSW, Australia",
    kind: "detached",
    countryCode: "AU",
    currency: "AUD",
    tenantId: "tenant_demo_au",
    propertyIds: ["GAS-AU-HOME-001"],
  },
  {
    buildingId: "BLD-AU-MELBOURNE-APT",
    buildingName: "Melbourne Harbour Residences",
    addressLabel: "VIC, Australia",
    kind: "apartment",
    countryCode: "AU",
    currency: "AUD",
    tenantId: "tenant_demo_au",
    propertyIds: ["GAS-AU-APT-12A", "GAS-AU-APT-12B"],
  },
];

export function listGasBuildingsV1(): GasBuildingDefV1[] {
  return [...GAS_MONITOR_BUILDINGS_V1];
}

export function findBuildingForPropertyV1(
  propertyId: string
): GasBuildingDefV1 | null {
  const id = String(propertyId || "").trim();
  return (
    GAS_MONITOR_BUILDINGS_V1.find((b) =>
      b.propertyIds.includes(id)
    ) || null
  );
}

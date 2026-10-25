/**
 * Web Push 購読を物件単位で突き合わせる。
 * HOME siteId と Security siteId は同じ物件として扱う。
 */

import { isTomsOpsPushUserV1 } from "../home/home-board-temp-alert-v1.js";

const PUSH_PROPERTY_GROUPS_V1: readonly (readonly string[])[] = [
  [
    "HOME-JP-TOYOSHIMA",
    "SEC-JP-TOYOSHIMA-001",
    "SEC-JP-TOSHIMA-001",
    "TOYOSHIMA001",
    "TOSHIMA001",
  ],
  ["HOME-JP-ITABASHI-LIVE", "SEC-JP-ITABASHI-LIVE"],
  [
    "HOME-JP-RYUGASAKI",
    "SEC-JP-RYUGASAKI-001",
    "WASHMATE001",
  ],
  ["HOME-JP-TSUKUBA-001", "SEC-JP-TSUKUBA-001"],
];

export interface PushSubscriptionScopeV1 {
  siteId?: string | null;
  propertyId?: string | null;
  customerCode?: string | null;
}

export interface PushScopeRowV1 {
  user_id?: string | null;
  site_id?: string | null;
  property_id?: string | null;
}

function cleanId(value: unknown): string {
  return String(value ?? "").trim();
}

/** 同じ物件を指す ID をまとめる */
export function pushPropertyKeysV1(
  ...ids: Array<string | null | undefined>
): Set<string> {
  const keys = new Set(ids.map(cleanId).filter(Boolean));
  for (const group of PUSH_PROPERTY_GROUPS_V1) {
    if (group.some((id) => keys.has(id))) {
      for (const id of group) keys.add(id);
    }
  }
  return keys;
}

export function pushPropertiesOverlapV1(
  left: Array<string | null | undefined>,
  right: Array<string | null | undefined>
): boolean {
  const a = pushPropertyKeysV1(...left);
  const b = pushPropertyKeysV1(...right);
  if (!a.size || !b.size) return true;
  for (const id of a) {
    if (b.has(id)) return true;
  }
  return false;
}

export function normalizePushCustomerCodeV1(value: unknown): string | null {
  const code = cleanId(value).toUpperCase();
  if (!code) return null;
  return code === "TOSHIMA001" ? "TOYOSHIMA001" : code;
}

export function normalizePushScopeV1(
  scope?: PushSubscriptionScopeV1 | null
): { siteId: string | null; propertyId: string | null; customerCode: string | null } {
  const siteId = cleanId(scope?.siteId) || null;
  const propertyId = cleanId(scope?.propertyId) || null;
  return {
    siteId,
    propertyId,
    customerCode: normalizePushCustomerCodeV1(scope?.customerCode),
  };
}

/**
 * 送信先物件と購読行が一致するか。
 * 物件未設定の旧購読と、社内（toms-ops）購読は全物件に届ける。
 */
export function pushRowMatchesPropertyScopeV1(
  row: PushScopeRowV1,
  targetSiteId: string | null | undefined
): boolean {
  if (isTomsOpsPushUserV1(cleanId(row.user_id))) return true;
  const target = cleanId(targetSiteId);
  if (!target) return true;
  const rowSite = cleanId(row.site_id);
  const rowProperty = cleanId(row.property_id);
  if (!rowSite && !rowProperty) return true;
  return pushPropertiesOverlapV1([target], [rowSite, rowProperty]);
}

/** data の現場ID、顧客コード、または HOME-/SEC- の deviceId を物件キーにする */
export function explicitPushSiteIdV1(input: {
  deviceId?: string | null;
  data?: Record<string, unknown> | null;
}): string {
  const data = input.data ?? {};
  const fromData = [
    data.siteId,
    data.propertyId,
    data.homeSiteId,
    data.securitySiteId,
    data.customerCode,
  ]
    .map(cleanId)
    .find(Boolean);
  if (fromData) return fromData;
  const deviceId = cleanId(input.deviceId);
  if (/^(HOME|SEC)-/.test(deviceId)) return deviceId;
  if (deviceId === "TOYOSHIMA001" || deviceId === "TOSHIMA001") return deviceId;
  return "";
}

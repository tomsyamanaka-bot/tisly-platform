/**
 * 社内端末だけの通知絞り込み。
 * notification_tokens / pwa_subscriptions は更新しない。
 */

import { getDatabase } from "../db/database.js";
import {
  isCustomerPushUserV1,
  isTomsOpsPushUserV1,
} from "../home/home-board-temp-alert-v1.js";
import { pushPropertiesOverlapV1 } from "./push-property-scope-v1.js";

export interface StaffNotifyFocusV1 {
  endpoint: string;
  enabled: boolean;
  siteId: string;
  propertyId: string;
  updatedAt: string;
}

export interface StaffNotifyFocusSiteV1 {
  siteId: string;
  propertyId: string;
  /** 未指定は ON。明示の false はその行を絞らない。 */
  enabled?: boolean;
  updatedAt?: string;
}

/** 社内 Push の user_id。施主の customer-security は含めない。 */
export const STAFF_NOTIFY_FOCUS_USER_IDS_V1 = [
  "toms-ops",
  "home-security",
  "admin-default",
  "remote-test",
] as const;

export function isStaffNotifyFocusUserV1(userId: string): boolean {
  const id = clean(userId);
  return isTomsOpsPushUserV1(id) || id === "home-security";
}

export function staffFocusUserKeyV1(userId: string): string {
  return `user:${clean(userId)}`;
}

const ENSURE_SQL = `
CREATE TABLE IF NOT EXISTS staff_notify_focus_v1 (
  endpoint TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  site_id TEXT,
  property_id TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
)`;

let tableReady = false;

function ensureStaffNotifyFocusTableV1(): void {
  if (tableReady) return;
  getDatabase().exec(ENSURE_SQL);
  tableReady = true;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function focusStampV1(): string {
  return new Date().toISOString();
}

export function saveStaffNotifyFocusV1(input: {
  endpoint: string;
  enabled: boolean;
  siteId?: string | null;
  propertyId?: string | null;
  updatedAt?: string | null;
}): StaffNotifyFocusV1 {
  ensureStaffNotifyFocusTableV1();
  const endpoint = clean(input.endpoint);
  if (!endpoint) {
    throw new Error("endpoint required");
  }
  const enabled = Boolean(input.enabled);
  const siteId = clean(input.siteId);
  const propertyId = clean(input.propertyId) || siteId;
  const updatedAt = clean(input.updatedAt) || focusStampV1();
  if (enabled && !siteId && !propertyId) {
    throw new Error("siteId required");
  }
  getDatabase()
    .prepare(
      `INSERT INTO staff_notify_focus_v1 (
         endpoint, enabled, site_id, property_id, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         enabled = excluded.enabled,
         site_id = excluded.site_id,
         property_id = excluded.property_id,
         updated_at = excluded.updated_at`
    )
    .run(endpoint, enabled ? 1 : 0, siteId, propertyId, updatedAt);
  const saved = readStaffNotifyFocusV1(endpoint);
  if (!saved) {
    throw new Error("focus save failed");
  }
  return saved;
}

export function readStaffNotifyFocusV1(
  endpoint: string
): StaffNotifyFocusV1 | null {
  ensureStaffNotifyFocusTableV1();
  const key = clean(endpoint);
  if (!key) return null;
  const row = getDatabase()
    .prepare(
      `SELECT endpoint, enabled, site_id, property_id, updated_at
       FROM staff_notify_focus_v1 WHERE endpoint = ?`
    )
    .get(key) as
    | {
        endpoint: string;
        enabled: number;
        site_id: string | null;
        property_id: string | null;
        updated_at: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    endpoint: row.endpoint,
    enabled: Number(row.enabled) === 1,
    siteId: clean(row.site_id),
    propertyId: clean(row.property_id),
    updatedAt: clean(row.updated_at),
  };
}

/**
 * 絞り込み行を全部読む。OFF の行も残し、新しいミュートと時刻で比べる。
 */
export function loadEnabledStaffFocusMapV1(): Map<
  string,
  StaffNotifyFocusSiteV1
> {
  ensureStaffNotifyFocusTableV1();
  const rows = getDatabase()
    .prepare(
      `SELECT endpoint, enabled, site_id, property_id, updated_at
       FROM staff_notify_focus_v1`
    )
    .all() as Array<{
    endpoint: string;
    enabled: number;
    site_id: string | null;
    property_id: string | null;
    updated_at: string | null;
  }>;
  const map = new Map<string, StaffNotifyFocusSiteV1>();
  for (const row of rows) {
    const endpoint = clean(row.endpoint);
    if (!endpoint) continue;
    map.set(endpoint, {
      enabled: Number(row.enabled) === 1,
      siteId: clean(row.site_id),
      propertyId: clean(row.property_id),
      updatedAt: clean(row.updated_at),
    });
  }
  return map;
}

export function saveStaffNotifyPreferenceV1(input: {
  endpoint?: string | null;
  userId?: string | null;
  enabled?: boolean;
  muteOtherSites?: boolean;
  siteId?: string | null;
  activeSiteId?: string | null;
  propertyId?: string | null;
}): StaffNotifyFocusV1 {
  const enabled =
    input.muteOtherSites == null
      ? Boolean(input.enabled)
      : Boolean(input.muteOtherSites);
  const siteId = clean(input.activeSiteId) || clean(input.siteId);
  const propertyId = clean(input.propertyId) || siteId;
  const endpoint = clean(input.endpoint);
  const userId = clean(input.userId);
  if (!endpoint && !userId) {
    throw new Error("endpoint required");
  }
  if (enabled && !siteId && !propertyId) {
    throw new Error("siteId required");
  }

  const updatedAt = focusStampV1();
  let saved: StaffNotifyFocusV1 | null = null;
  if (endpoint && !endpoint.startsWith("user:")) {
    saved = saveStaffNotifyFocusV1({
      endpoint,
      enabled,
      siteId,
      propertyId,
      updatedAt,
    });
  }
  const users = new Set<string>();
  if (userId && isStaffNotifyFocusUserV1(userId)) {
    for (const id of STAFF_NOTIFY_FOCUS_USER_IDS_V1) users.add(id);
  }
  for (const id of users) {
    const row = saveStaffNotifyFocusV1({
      endpoint: staffFocusUserKeyV1(id),
      enabled,
      siteId,
      propertyId,
      updatedAt,
    });
    if (!saved) saved = row;
  }
  if (!saved) {
    throw new Error("focus save failed");
  }
  return {
    ...saved,
    endpoint: endpoint || saved.endpoint,
    enabled,
    siteId,
    propertyId,
  };
}

function focusIsOnV1(focus?: { enabled?: boolean } | null): boolean {
  return Boolean(focus) && focus?.enabled !== false;
}

/** 時刻が新しい行を採用する。同時刻なら ON を優先し、アカウント側のミュートを残す。 */
function preferStaffFocusV1<T extends { enabled?: boolean; updatedAt?: string }>(
  current: T | null | undefined,
  next: T | null | undefined
): T | null | undefined {
  if (!next) return current;
  if (!current) return next;
  const currentAt = clean(current.updatedAt);
  const nextAt = clean(next.updatedAt);
  if (currentAt && nextAt && currentAt !== nextAt) {
    return currentAt > nextAt ? current : next;
  }
  if (!currentAt && nextAt) return next;
  if (currentAt && !nextAt) return current;
  if (focusIsOnV1(next) && !focusIsOnV1(current)) return next;
  if (focusIsOnV1(current) && !focusIsOnV1(next)) return current;
  return next;
}

export function readStaffNotifyPreferenceV1(input: {
  endpoint?: string | null;
  userId?: string | null;
}): StaffNotifyFocusV1 {
  const endpoint = clean(input.endpoint);
  const userId = clean(input.userId);
  const direct =
    endpoint && !endpoint.startsWith("user:")
      ? readStaffNotifyFocusV1(endpoint)
      : null;
  const byUser =
    userId && isStaffNotifyFocusUserV1(userId)
      ? readStaffNotifyFocusV1(staffFocusUserKeyV1(userId))
      : null;
  const chosen = preferStaffFocusV1(direct, byUser);
  if (chosen) {
    return { ...chosen, endpoint: endpoint || chosen.endpoint };
  }
  return {
    endpoint,
    enabled: false,
    siteId: "",
    propertyId: "",
    updatedAt: "",
  };
}

function newestStaffUserFocusV1(
  focusMap: Map<string, StaffNotifyFocusSiteV1>
): StaffNotifyFocusSiteV1 | undefined {
  let best: StaffNotifyFocusSiteV1 | undefined;
  for (const id of STAFF_NOTIFY_FOCUS_USER_IDS_V1) {
    best = preferStaffFocusV1(best, focusMap.get(staffFocusUserKeyV1(id))) ?? undefined;
  }
  return best;
}

/**
 * 社内・保守端末で絞り込み ON のとき、対象外の現場 Push を送らない。
 * 施主購読と、現場の付かないシステム通知はそのまま。
 * 端末ごとの古い OFF は、あとから保存したミュートより優先しない。
 */
export function staffFocusAllowsPushV1(
  row: { endpoint?: string | null; user_id?: string | null },
  targetSiteId: string | null | undefined,
  focusMap: Map<string, StaffNotifyFocusSiteV1>
): boolean {
  const userId = clean(row.user_id);
  if (isCustomerPushUserV1(userId)) return true;
  const endpoint = clean(row.endpoint);
  const direct =
    endpoint && !endpoint.startsWith("user:")
      ? focusMap.get(endpoint)
      : undefined;
  const own = isStaffNotifyFocusUserV1(userId)
    ? focusMap.get(staffFocusUserKeyV1(userId))
    : undefined;
  const focus = preferStaffFocusV1(
    preferStaffFocusV1(direct, own),
    newestStaffUserFocusV1(focusMap)
  );
  if (!focusIsOnV1(focus)) return true;
  const target = clean(targetSiteId);
  if (!target) return true;
  return pushPropertiesOverlapV1(
    [target],
    [focus?.siteId, focus?.propertyId]
  );
}

/** 同じエンドポイントの施主行から、社内ミュートをすり抜けない。 */
export function staffFocusAllowsEndpointV1(
  rows: Array<{ endpoint?: string | null; user_id?: string | null }>,
  targetSiteId: string | null | undefined,
  focusMap: Map<string, StaffNotifyFocusSiteV1>
): boolean {
  const staffish = rows.find((row) => !isCustomerPushUserV1(clean(row.user_id)));
  if (!staffish) return true;
  return staffFocusAllowsPushV1(staffish, targetSiteId, focusMap);
}

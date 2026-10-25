/**
 * 社内端末だけの通知絞り込み。
 * notification_tokens / pwa_subscriptions は更新しない。
 */

import { getDatabase } from "../db/database.js";
import { isTomsOpsPushUserV1 } from "../home/home-board-temp-alert-v1.js";
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
  /** 未指定は ON。明示の false はその端末を絞らない。 */
  enabled?: boolean;
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

export function saveStaffNotifyFocusV1(input: {
  endpoint: string;
  enabled: boolean;
  siteId?: string | null;
  propertyId?: string | null;
}): StaffNotifyFocusV1 {
  ensureStaffNotifyFocusTableV1();
  const endpoint = clean(input.endpoint);
  if (!endpoint) {
    throw new Error("endpoint required");
  }
  const enabled = Boolean(input.enabled);
  const siteId = clean(input.siteId);
  const propertyId = clean(input.propertyId) || siteId;
  if (enabled && !siteId && !propertyId) {
    throw new Error("siteId required");
  }
  getDatabase()
    .prepare(
      `INSERT INTO staff_notify_focus_v1 (
         endpoint, enabled, site_id, property_id, updated_at
       ) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(endpoint) DO UPDATE SET
         enabled = excluded.enabled,
         site_id = excluded.site_id,
         property_id = excluded.property_id,
         updated_at = datetime('now')`
    )
    .run(endpoint, enabled ? 1 : 0, siteId, propertyId);
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
 * 絞り込み行を全部読む。
 * OFF の端末行も残し、ユーザー単位の設定へ落ちないようにする。
 */
export function loadEnabledStaffFocusMapV1(): Map<
  string,
  StaffNotifyFocusSiteV1
> {
  ensureStaffNotifyFocusTableV1();
  const rows = getDatabase()
    .prepare(
      `SELECT endpoint, enabled, site_id, property_id
       FROM staff_notify_focus_v1`
    )
    .all() as Array<{
    endpoint: string;
    enabled: number;
    site_id: string | null;
    property_id: string | null;
  }>;
  const map = new Map<string, StaffNotifyFocusSiteV1>();
  for (const row of rows) {
    const endpoint = clean(row.endpoint);
    if (!endpoint) continue;
    map.set(endpoint, {
      enabled: Number(row.enabled) === 1,
      siteId: clean(row.site_id),
      propertyId: clean(row.property_id),
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

  let saved: StaffNotifyFocusV1 | null = null;
  if (endpoint && !endpoint.startsWith("user:")) {
    saved = saveStaffNotifyFocusV1({
      endpoint,
      enabled,
      siteId,
      propertyId,
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
  if (direct) return direct;
  if (userId && isStaffNotifyFocusUserV1(userId)) {
    const byUser = readStaffNotifyFocusV1(staffFocusUserKeyV1(userId));
    if (byUser) {
      return { ...byUser, endpoint: endpoint || byUser.endpoint };
    }
  }
  return {
    endpoint,
    enabled: false,
    siteId: "",
    propertyId: "",
    updatedAt: "",
  };
}

/**
 * 社内購読で絞り込み ON のとき、対象外の現場 Push を送らない。
 * 施主購読と、現場の付かないシステム通知はそのまま。
 */
function focusEntryEnabledV1(focus: StaffNotifyFocusSiteV1 | undefined): boolean {
  if (!focus) return false;
  return focus.enabled !== false;
}

export function staffFocusAllowsPushV1(
  row: { endpoint?: string | null; user_id?: string | null },
  targetSiteId: string | null | undefined,
  focusMap: Map<string, StaffNotifyFocusSiteV1>
): boolean {
  const userId = clean(row.user_id);
  if (!isStaffNotifyFocusUserV1(userId)) return true;
  const direct = focusMap.get(clean(row.endpoint));
  const focus = direct || focusMap.get(staffFocusUserKeyV1(userId));
  if (!focusEntryEnabledV1(focus)) return true;
  const target = clean(targetSiteId);
  if (!target) return true;
  return pushPropertiesOverlapV1(
    [target],
    [focus?.siteId, focus?.propertyId]
  );
}

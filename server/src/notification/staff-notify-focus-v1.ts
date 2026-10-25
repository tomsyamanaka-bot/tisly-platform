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
  activeSiteId?: string;
  muteBySite?: Record<string, boolean>;
  mutedSites?: string[];
}

export interface StaffMuteSiteRowV1 {
  siteId: string;
  propertyId: string;
  enabled: boolean;
  updatedAt: string;
}

export interface StaffNotifyFocusSiteV1 {
  siteId: string;
  propertyId: string;
  /** 未指定は ON。明示の false はその行を絞らない。 */
  enabled?: boolean;
  updatedAt?: string;
  /** 現場ごとのミュート。あるときはこちらを優先する。 */
  muteBySite?: Record<string, StaffMuteSiteRowV1>;
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

const MUTE_SQL = `
CREATE TABLE IF NOT EXISTS staff_notify_mute_site_v1 (
  user_key TEXT NOT NULL,
  site_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  property_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_key, site_id)
)`;

let tableReady = false;

function ensureStaffNotifyFocusTableV1(): void {
  if (tableReady) return;
  const db = getDatabase();
  db.exec(ENSURE_SQL);
  db.exec(MUTE_SQL);
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

function saveMuteSiteV1(
  userKey: string,
  siteId: string,
  propertyId: string,
  enabled: boolean,
  updatedAt: string
): void {
  ensureStaffNotifyFocusTableV1();
  const key = clean(userKey);
  const site = clean(siteId);
  if (!key || !site) return;
  getDatabase()
    .prepare(
      `INSERT INTO staff_notify_mute_site_v1 (
         user_key, site_id, enabled, property_id, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_key, site_id) DO UPDATE SET
         enabled = excluded.enabled,
         property_id = excluded.property_id,
         updated_at = excluded.updated_at`
    )
    .run(key, site, enabled ? 1 : 0, clean(propertyId) || site, updatedAt);
}

function listMuteSitesV1(userKey: string): StaffMuteSiteRowV1[] {
  ensureStaffNotifyFocusTableV1();
  const key = clean(userKey);
  if (!key) return [];
  const rows = getDatabase()
    .prepare(
      `SELECT site_id, property_id, enabled, updated_at
       FROM staff_notify_mute_site_v1 WHERE user_key = ?`
    )
    .all(key) as Array<{
    site_id: string | null;
    property_id: string | null;
    enabled: number;
    updated_at: string | null;
  }>;
  return rows
    .map((row) => ({
      siteId: clean(row.site_id),
      propertyId: clean(row.property_id) || clean(row.site_id),
      enabled: Number(row.enabled) === 1,
      updatedAt: clean(row.updated_at),
    }))
    .filter((row) => row.siteId);
}

function listAllMuteSitesV1(): Array<StaffMuteSiteRowV1 & { userKey: string }> {
  ensureStaffNotifyFocusTableV1();
  const rows = getDatabase()
    .prepare(
      `SELECT user_key, site_id, property_id, enabled, updated_at
       FROM staff_notify_mute_site_v1`
    )
    .all() as Array<{
    user_key: string | null;
    site_id: string | null;
    property_id: string | null;
    enabled: number;
    updated_at: string | null;
  }>;
  return rows
    .map((row) => ({
      userKey: clean(row.user_key),
      siteId: clean(row.site_id),
      propertyId: clean(row.property_id) || clean(row.site_id),
      enabled: Number(row.enabled) === 1,
      updatedAt: clean(row.updated_at),
    }))
    .filter((row) => row.userKey && row.siteId);
}

function newerMuteRowV1(
  current: StaffMuteSiteRowV1 | null,
  next: StaffMuteSiteRowV1
): StaffMuteSiteRowV1 {
  if (!current) return next;
  return (next.updatedAt || "") >= (current.updatedAt || "") ? next : current;
}

function muteDecisionV1(
  rows: StaffMuteSiteRowV1[],
  siteId: string,
  propertyId: string
): StaffMuteSiteRowV1 | null {
  const targetSite = clean(siteId);
  const targetProperty = clean(propertyId);
  if (!targetSite && !targetProperty) return null;
  let best: StaffMuteSiteRowV1 | null = null;
  for (const row of rows) {
    if (!row.siteId && !row.propertyId) continue;
    if (
      !pushPropertiesOverlapV1(
        [targetSite, targetProperty],
        [row.siteId, row.propertyId]
      )
    ) {
      continue;
    }
    best = newerMuteRowV1(best, row);
  }
  return best;
}

function collapseMuteRowsV1(rows: StaffMuteSiteRowV1[]): StaffMuteSiteRowV1[] {
  const bySite = new Map<string, StaffMuteSiteRowV1>();
  for (const row of rows) {
    if (!row.siteId) continue;
    bySite.set(row.siteId, newerMuteRowV1(bySite.get(row.siteId) ?? null, row));
  }
  return [...bySite.values()];
}

function muteBySiteRecordV1(
  rows: StaffMuteSiteRowV1[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of collapseMuteRowsV1(rows)) out[row.siteId] = row.enabled;
  return out;
}

function mutedSiteIdsV1(rows: StaffMuteSiteRowV1[]): string[] {
  return collapseMuteRowsV1(rows)
    .filter((row) => row.enabled)
    .map((row) => row.siteId);
}

function muteMapRecordV1(
  rows: StaffMuteSiteRowV1[]
): Record<string, StaffMuteSiteRowV1> {
  const out: Record<string, StaffMuteSiteRowV1> = {};
  for (const row of collapseMuteRowsV1(rows)) out[row.siteId] = row;
  return out;
}

/**
 * 絞り込み行を全部読む。OFF の行も残し、現場ごとのミュートも付ける。
 */
export function loadEnabledStaffFocusMapV1(): Map<
  string,
  StaffNotifyFocusSiteV1
> {
  ensureStaffNotifyFocusTableV1();
  const muteByKey = new Map<string, StaffMuteSiteRowV1[]>();
  for (const row of listAllMuteSitesV1()) {
    const list = muteByKey.get(row.userKey) ?? [];
    list.push(row);
    muteByKey.set(row.userKey, list);
  }
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
    const muteRows = muteByKey.get(endpoint) ?? [];
    map.set(endpoint, {
      enabled: Number(row.enabled) === 1,
      siteId: clean(row.site_id),
      propertyId: clean(row.property_id),
      updatedAt: clean(row.updated_at),
      muteBySite: muteMapRecordV1(muteRows),
    });
  }
  return map;
}

function preferenceKeysV1(endpoint: string, userId: string): string[] {
  const keys: string[] = [];
  if (endpoint && !endpoint.startsWith("user:")) keys.push(endpoint);
  if (userId && isStaffNotifyFocusUserV1(userId)) {
    for (const id of STAFF_NOTIFY_FOCUS_USER_IDS_V1) {
      keys.push(staffFocusUserKeyV1(id));
    }
  }
  return keys;
}

function explicitMuteSitesV1(input: {
  enabled?: boolean;
  muteOtherSites?: boolean;
  siteId?: string | null;
  activeSiteId?: string | null;
  propertyId?: string | null;
  muteBySite?: Record<string, boolean> | null;
  mutedSites?: string[] | null;
}): Array<{ siteId: string; propertyId: string; enabled: boolean }> {
  const siteId = clean(input.activeSiteId) || clean(input.siteId);
  const propertyId = clean(input.propertyId) || siteId;
  const sites: Array<{ siteId: string; propertyId: string; enabled: boolean }> =
    [];
  if (input.muteBySite && typeof input.muteBySite === "object") {
    for (const [id, value] of Object.entries(input.muteBySite)) {
      const key = clean(id);
      if (!key) continue;
      sites.push({ siteId: key, propertyId: key, enabled: Boolean(value) });
    }
  }
  if (
    Array.isArray(input.mutedSites) &&
    input.muteOtherSites == null &&
    input.enabled == null &&
    !input.muteBySite
  ) {
    for (const id of input.mutedSites) {
      const key = clean(id);
      if (!key) continue;
      sites.push({ siteId: key, propertyId: key, enabled: true });
    }
  }
  if (input.muteOtherSites != null || input.enabled != null) {
    const enabled =
      input.muteOtherSites == null
        ? Boolean(input.enabled)
        : Boolean(input.muteOtherSites);
    if (enabled && !siteId) throw new Error("siteId required");
    if (siteId) sites.push({ siteId, propertyId, enabled });
  }
  return sites;
}

export function saveStaffNotifyPreferenceV1(input: {
  endpoint?: string | null;
  userId?: string | null;
  enabled?: boolean;
  muteOtherSites?: boolean;
  siteId?: string | null;
  activeSiteId?: string | null;
  propertyId?: string | null;
  muteBySite?: Record<string, boolean> | null;
  mutedSites?: string[] | null;
}): StaffNotifyFocusV1 {
  const siteId = clean(input.activeSiteId) || clean(input.siteId);
  const propertyId = clean(input.propertyId) || siteId;
  const endpoint = clean(input.endpoint);
  const userId = clean(input.userId);
  if (!endpoint && !userId) {
    throw new Error("endpoint required");
  }
  const keys = preferenceKeysV1(endpoint, userId);
  if (!keys.length) {
    throw new Error("endpoint required");
  }
  const sites = explicitMuteSitesV1(input);
  const updatedAt = focusStampV1();
  for (const key of keys) {
    for (const site of sites) {
      saveMuteSiteV1(key, site.siteId, site.propertyId, site.enabled, updatedAt);
    }
  }
  if (siteId) {
    for (const key of keys) {
      const legacy = readStaffNotifyFocusV1(key);
      if (
        legacy?.enabled &&
        legacy.siteId &&
        !muteDecisionV1(listMuteSitesV1(key), legacy.siteId, legacy.propertyId)
      ) {
        saveMuteSiteV1(
          key,
          legacy.siteId,
          legacy.propertyId,
          true,
          legacy.updatedAt || updatedAt
        );
      }
    }
    const stored = muteDecisionV1(
      keys.flatMap((key) => listMuteSitesV1(key)),
      siteId,
      propertyId
    );
    const activeEnabled = stored?.enabled ?? false;
    for (const key of keys) {
      saveStaffNotifyFocusV1({
        endpoint: key,
        enabled: activeEnabled,
        siteId,
        propertyId: stored?.propertyId || propertyId,
        updatedAt,
      });
    }
  } else if (!sites.length) {
    throw new Error("siteId required");
  }
  return readStaffNotifyPreferenceV1({
    endpoint,
    userId,
    siteId,
    propertyId,
  });
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

function collectMuteRowsV1(endpoint: string, userId: string): StaffMuteSiteRowV1[] {
  const rows: StaffMuteSiteRowV1[] = [];
  for (const key of preferenceKeysV1(endpoint, userId)) {
    rows.push(...listMuteSitesV1(key));
  }
  return rows;
}

export function readStaffNotifyPreferenceV1(input: {
  endpoint?: string | null;
  userId?: string | null;
  siteId?: string | null;
  propertyId?: string | null;
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
  const focus = preferStaffFocusV1(direct, byUser);
  const activeSiteId = clean(focus?.siteId);
  const requested = clean(input.siteId) || activeSiteId;
  const requestedProperty =
    clean(input.propertyId) ||
    (requested && requested === activeSiteId ? clean(focus?.propertyId) : requested);
  let rows = collectMuteRowsV1(endpoint, userId);
  if (
    focus?.enabled &&
    activeSiteId &&
    !muteDecisionV1(rows, activeSiteId, focus.propertyId)
  ) {
    rows = rows.concat({
      siteId: activeSiteId,
      propertyId: clean(focus.propertyId) || activeSiteId,
      enabled: true,
      updatedAt: clean(focus.updatedAt),
    });
  }
  const decision = muteDecisionV1(rows, requested, requestedProperty);
  const muteBySite = muteBySiteRecordV1(rows);
  const mutedSites = mutedSiteIdsV1(rows);
  return {
    endpoint: endpoint || focus?.endpoint || "",
    enabled: decision?.enabled ?? false,
    siteId: requested,
    propertyId: decision?.propertyId || requestedProperty,
    updatedAt: decision?.updatedAt || clean(focus?.updatedAt),
    activeSiteId,
    muteBySite,
    mutedSites,
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
function mergedMuteMapV1(
  ...maps: Array<Record<string, StaffMuteSiteRowV1> | undefined>
): Record<string, StaffMuteSiteRowV1> {
  const out: Record<string, StaffMuteSiteRowV1> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [siteId, row] of Object.entries(map)) {
      out[siteId] = newerMuteRowV1(out[siteId] ?? null, row);
    }
  }
  return out;
}

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
  const operator = newestStaffUserFocusV1(focusMap);
  const focus = preferStaffFocusV1(preferStaffFocusV1(direct, own), operator);
  const muteBySite = mergedMuteMapV1(
    direct?.muteBySite,
    own?.muteBySite,
    operator?.muteBySite
  );
  const activeSite = clean(focus?.siteId);
  const activeProperty = clean(focus?.propertyId);
  if (Object.keys(muteBySite).length && activeSite) {
    const decision = muteDecisionV1(
      Object.values(muteBySite),
      activeSite,
      activeProperty
    );
    if (!decision?.enabled) return true;
    const target = clean(targetSiteId);
    if (!target) return true;
    return pushPropertiesOverlapV1(
      [target],
      [activeSite, activeProperty, decision.propertyId]
    );
  }
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

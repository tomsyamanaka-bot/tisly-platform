/**
 * 豊島邸 運用設定 v1
 *
 * ハートビート死活監視の ON/OFF など
 * 社内保守用フラグを永続化する。
 * 既存データは削除せず追記のみ。
 */

import { getDatabase } from "../db/database.js";

/** 循環参照回避のため ID をここで固定 */
const TOYOSHIMA_HOME_SITE_ID_V1 = "HOME-JP-TOYOSHIMA";

export interface ToyoshimaOpsConfigV1 {
  siteId: string;
  /**
   * ハートビート死活監視
   * false 時は Push・Shelly自動再投入を抑止
   */
  heartbeatWatchEnabled: boolean;
  updatedAt: string;
}

export interface ToyoshimaOpsConfigPatchV1 {
  heartbeatWatchEnabled?: boolean;
}

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function ensureTableV1(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS home_toyoshima_ops_config_v1 (
      site_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tableReady = true;
}

function defaultConfigV1(siteId: string): ToyoshimaOpsConfigV1 {
  return {
    siteId: siteId || TOYOSHIMA_HOME_SITE_ID_V1,
    heartbeatWatchEnabled: true,
    updatedAt: nowIso(),
  };
}

function parseConfigV1(
  siteId: string,
  raw: unknown
): ToyoshimaOpsConfigV1 {
  const base = defaultConfigV1(siteId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    siteId,
    heartbeatWatchEnabled:
      o.heartbeatWatchEnabled === undefined
        ? true
        : Boolean(o.heartbeatWatchEnabled),
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
  };
}

function persistV1(cfg: ToyoshimaOpsConfigV1): void {
  ensureTableV1();
  getDatabase()
    .prepare(
      `INSERT INTO home_toyoshima_ops_config_v1 (site_id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    )
    .run(cfg.siteId, JSON.stringify(cfg), cfg.updatedAt);
}

/** 豊島邸運用設定を取得 */
export function getToyoshimaOpsConfigV1(
  siteId?: string | null
): ToyoshimaOpsConfigV1 {
  const sid = String(siteId || TOYOSHIMA_HOME_SITE_ID_V1).trim();
  ensureTableV1();
  const row = getDatabase()
    .prepare(
      `SELECT config_json FROM home_toyoshima_ops_config_v1 WHERE site_id = ?`
    )
    .get(sid) as { config_json: string } | undefined;
  if (!row?.config_json) return defaultConfigV1(sid);
  try {
    return parseConfigV1(sid, JSON.parse(row.config_json));
  } catch {
    return defaultConfigV1(sid);
  }
}

/** 運用設定を更新 */
export function updateToyoshimaOpsConfigV1(
  siteId: string | null | undefined,
  patch: ToyoshimaOpsConfigPatchV1
): ToyoshimaOpsConfigV1 {
  const sid = String(siteId || TOYOSHIMA_HOME_SITE_ID_V1).trim();
  const current = getToyoshimaOpsConfigV1(sid);
  const next: ToyoshimaOpsConfigV1 = {
    ...current,
    heartbeatWatchEnabled:
      patch.heartbeatWatchEnabled !== undefined
        ? Boolean(patch.heartbeatWatchEnabled)
        : current.heartbeatWatchEnabled,
    updatedAt: nowIso(),
  };
  persistV1(next);
  return next;
}

/** 死活監視が有効か（未設定は有効） */
export function isToyoshimaHeartbeatWatchEnabledV1(
  siteId?: string | null
): boolean {
  return getToyoshimaOpsConfigV1(siteId).heartbeatWatchEnabled !== false;
}

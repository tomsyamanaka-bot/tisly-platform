/**
 * 豊島邸ハートビート永続化
 * POST 受信値を SQLite に残し
 * VPS 再起動後も同じ時刻を返す
 * 既存行は削除せず upsert のみ
 */

import { getDatabase } from "../db/database.js";

export type ToyoshimaHeartbeatBuildingV1 = "main" | "detached";

export interface ToyoshimaHeartbeatDeviceRowV1 {
  lastHeartbeatAt: string | null;
  lastCommAt: string | null;
  boardTempC: number | null;
}

export interface ToyoshimaHeartbeatStoreV1 {
  siteId: string;
  main: ToyoshimaHeartbeatDeviceRowV1;
  detached: ToyoshimaHeartbeatDeviceRowV1;
  updatedAt: string;
}

const TOYOSHIMA_HOME_SITE_ID_V1 = "HOME-JP-TOYOSHIMA";

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function emptyDeviceRow(): ToyoshimaHeartbeatDeviceRowV1 {
  return {
    lastHeartbeatAt: null,
    lastCommAt: null,
    boardTempC: null,
  };
}

function emptyStore(siteId: string): ToyoshimaHeartbeatStoreV1 {
  return {
    siteId: siteId || TOYOSHIMA_HOME_SITE_ID_V1,
    main: emptyDeviceRow(),
    detached: emptyDeviceRow(),
    updatedAt: nowIso(),
  };
}

function ensureTableV1(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS home_toyoshima_heartbeat_v1 (
      site_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tableReady = true;
}

/** JSON の null を 0℃ と誤認しない */
function parseBoardTempC(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const temp = Number(raw);
  if (!Number.isFinite(temp) || temp < -40 || temp > 125) return null;
  return Math.round(temp * 10) / 10;
}

function parseDeviceRow(
  raw: unknown
): ToyoshimaHeartbeatDeviceRowV1 {
  const base = emptyDeviceRow();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const hb =
    typeof o.lastHeartbeatAt === "string" && o.lastHeartbeatAt
      ? o.lastHeartbeatAt
      : null;
  const comm =
    typeof o.lastCommAt === "string" && o.lastCommAt
      ? o.lastCommAt
      : null;
  return {
    lastHeartbeatAt: hb,
    lastCommAt: comm,
    boardTempC: parseBoardTempC(o.boardTempC),
  };
}

function parseStore(
  siteId: string,
  raw: unknown
): ToyoshimaHeartbeatStoreV1 {
  const base = emptyStore(siteId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    siteId,
    main: parseDeviceRow(o.main),
    detached: parseDeviceRow(o.detached),
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
  };
}

/** 保存済み HB を読む。無ければ null */
export function loadToyoshimaHeartbeatStoreV1(
  siteId: string = TOYOSHIMA_HOME_SITE_ID_V1
): ToyoshimaHeartbeatStoreV1 | null {
  try {
    ensureTableV1();
    const row = getDatabase()
      .prepare(
        `SELECT state_json FROM home_toyoshima_heartbeat_v1
         WHERE site_id = ?`
      )
      .get(siteId) as { state_json?: string } | undefined;
    if (!row?.state_json) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.state_json);
    } catch {
      return null;
    }
    return parseStore(siteId, parsed);
  } catch {
    return null;
  }
}

/** HB 状態を upsert。既存サイト行は上書き更新のみ */
export function saveToyoshimaHeartbeatStoreV1(
  store: ToyoshimaHeartbeatStoreV1
): void {
  try {
    ensureTableV1();
    const siteId = store.siteId || TOYOSHIMA_HOME_SITE_ID_V1;
    const next: ToyoshimaHeartbeatStoreV1 = {
      siteId,
      main: parseDeviceRow(store.main),
      detached: parseDeviceRow(store.detached),
      updatedAt: nowIso(),
    };
    getDatabase()
      .prepare(
        `INSERT INTO home_toyoshima_heartbeat_v1
           (site_id, state_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`
      )
      .run(siteId, JSON.stringify(next), next.updatedAt);
  } catch {
    /* 永続化失敗でもメモリ状態は維持 */
  }
}

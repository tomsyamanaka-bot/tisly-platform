/**
 * 龍ヶ崎店の顧客向け詳細設定。
 * 人感の確定時間と、回転灯・ベルの
 * 動作秒を保存する。既存物件の表は
 * 作らず、この店専用の表だけ足す。
 */

import { getDatabase } from "../db/database.js";

/** 循環参照を避けるためサイト ID は直書き */
const SEC_JP_RYUGASAKI_SITE_ID_V1 = "SEC-JP-RYUGASAKI-001";

export interface RyugasakiCustomerSettingsV1 {
  siteId: string;
  /** 人感が続いてから知らせるまでのミリ秒 */
  di3ConfirmMs: number;
  do1DurationSec: number;
  do2DurationSec: number;
  updatedAt: string;
}

const DI3_MIN_MS = 1000;
const DI3_MAX_MS = 30000;
const DO_MIN_SEC = 5;
const DO_MAX_SEC = 180;

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

export function clampRyugasakiDi3ConfirmMsV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1000;
  const ms = Math.round(n);
  if (ms < DI3_MIN_MS) return DI3_MIN_MS;
  if (ms > DI3_MAX_MS) return DI3_MAX_MS;
  return ms;
}

export function clampRyugasakiDurationSecV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  const sec = Math.round(n);
  if (sec < DO_MIN_SEC) return DO_MIN_SEC;
  if (sec > DO_MAX_SEC) return DO_MAX_SEC;
  return sec;
}

function defaultSettings(siteId: string): RyugasakiCustomerSettingsV1 {
  return {
    siteId: siteId || SEC_JP_RYUGASAKI_SITE_ID_V1,
    di3ConfirmMs: 1000,
    do1DurationSec: 15,
    do2DurationSec: 15,
    updatedAt: nowIso(),
  };
}

function ensureTable(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS home_ryugasaki_settings_v1 (
      site_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tableReady = true;
}

function parseSettings(
  siteId: string,
  raw: unknown
): RyugasakiCustomerSettingsV1 {
  const base = defaultSettings(siteId);
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  return {
    siteId,
    di3ConfirmMs: clampRyugasakiDi3ConfirmMsV1(
      row.di3ConfirmMs ?? base.di3ConfirmMs
    ),
    do1DurationSec: clampRyugasakiDurationSecV1(
      row.do1DurationSec ?? base.do1DurationSec
    ),
    do2DurationSec: clampRyugasakiDurationSecV1(
      row.do2DurationSec ?? base.do2DurationSec
    ),
    updatedAt:
      typeof row.updatedAt === "string" ? row.updatedAt : base.updatedAt,
  };
}

export function getRyugasakiCustomerSettingsV1(
  siteId?: string | null
): RyugasakiCustomerSettingsV1 {
  const id = String(siteId || SEC_JP_RYUGASAKI_SITE_ID_V1).trim();
  try {
    ensureTable();
    const row = getDatabase()
      .prepare(
        `SELECT config_json FROM home_ryugasaki_settings_v1
         WHERE site_id = ?`
      )
      .get(id) as { config_json?: string } | undefined;
    if (!row?.config_json) return defaultSettings(id);
    return parseSettings(id, JSON.parse(row.config_json));
  } catch {
    return defaultSettings(id);
  }
}

export function saveRyugasakiCustomerSettingsV1(input: {
  siteId?: string | null;
  di3ConfirmMs?: unknown;
  do1DurationSec?: unknown;
  do2DurationSec?: unknown;
}): RyugasakiCustomerSettingsV1 {
  const id = String(input.siteId || SEC_JP_RYUGASAKI_SITE_ID_V1).trim();
  const prev = getRyugasakiCustomerSettingsV1(id);
  const next: RyugasakiCustomerSettingsV1 = {
    siteId: id,
    di3ConfirmMs:
      input.di3ConfirmMs === undefined
        ? prev.di3ConfirmMs
        : clampRyugasakiDi3ConfirmMsV1(input.di3ConfirmMs),
    do1DurationSec:
      input.do1DurationSec === undefined
        ? prev.do1DurationSec
        : clampRyugasakiDurationSecV1(input.do1DurationSec),
    do2DurationSec:
      input.do2DurationSec === undefined
        ? prev.do2DurationSec
        : clampRyugasakiDurationSecV1(input.do2DurationSec),
    updatedAt: nowIso(),
  };
  ensureTable();
  getDatabase()
    .prepare(
      `INSERT INTO home_ryugasaki_settings_v1
         (site_id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    )
    .run(id, JSON.stringify(next), next.updatedAt);
  return next;
}

export function durationSecForDoChannelV1(channel: 1 | 2): number {
  const settings = getRyugasakiCustomerSettingsV1();
  return channel === 1
    ? settings.do1DurationSec
    : settings.do2DurationSec;
}

/** テスト用。表の中身だけ消す */
export function resetRyugasakiSettingsForTestV1(): void {
  try {
    ensureTable();
    getDatabase()
      .prepare(`DELETE FROM home_ryugasaki_settings_v1`)
      .run();
  } catch {
    /* 未作成でもテストは続行 */
  }
}

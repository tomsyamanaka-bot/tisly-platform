/**
 * TiSLY HOME — 防犯ルール設定 v1
 *
 * DI1/DI2 ライト動作・警戒モード・
 * 通知フィルターを物件ごとに保持する。
 * 既存データは削除せず merge のみ。
 */

import { getDatabase } from "../db/database.js";
import { findHomeSiteV1 } from "./home-sites-v1.js";

/** 警戒モード（PWA 表示用） */
export type HomeGuardModeV1 = "always" | "night_only" | "off";

/** DI1 外周検知時の点灯モード */
export type HomeDi1LightModeV1 = "steady" | "blink" | "strobe";

/** 段階侵入 DI2 時のライトモード */
export type HomeDi2LightModeV1 = "fast_blink" | "steady";

export interface HomeSecurityRulesV1 {
  siteId: string;
  /** 24時間常時 / 夜間のみ / 警戒OFF */
  guardMode: HomeGuardModeV1;
  /** DI1 点灯時間（秒）10〜300 */
  di1DurationSec: number;
  di1LightMode: HomeDi1LightModeV1;
  /** DI2 段階侵入時のライト動作 */
  di2LightMode: HomeDi2LightModeV1;
  /** DI2 警報時間（秒）10〜300 */
  di2AlertDurationSec: number;
  /** DI1: サイレントログのみ（Push しない） */
  notifyDi1SilentLogOnly: boolean;
  /** DI2: 即時 Web Push 緊急通知 */
  notifyDi2InstantPush: boolean;
  /** シーン「ただいま」等の一時停止期限 */
  securityPausedUntil: string | null;
  updatedAt: string;
}

export interface HomeSecurityRulesPatchV1 {
  guardMode?: HomeGuardModeV1;
  di1DurationSec?: number;
  di1LightMode?: HomeDi1LightModeV1;
  di2LightMode?: HomeDi2LightModeV1;
  di2AlertDurationSec?: number;
  notifyDi1SilentLogOnly?: boolean;
  notifyDi2InstantPush?: boolean;
  securityPausedUntil?: string | null;
}

/** RP2350 向けファームウェア JSON */
export interface HomeSecurityFirmwareRulesV1 {
  version: number;
  siteId: string;
  guardMode: HomeGuardModeV1;
  guardActive: boolean;
  securityPaused: boolean;
  di1DurationMs: number;
  di1LightMode: HomeDi1LightModeV1;
  di2LightMode: HomeDi2LightModeV1;
  di2AlertDurationMs: number;
  perimeterFlagMs: number;
  strobeOnMs: number;
  strobeOffMs: number;
}

const GUARD_MODES: HomeGuardModeV1[] = ["always", "night_only", "off"];
const DI1_MODES: HomeDi1LightModeV1[] = ["steady", "blink", "strobe"];
const DI2_MODES: HomeDi2LightModeV1[] = ["fast_blink", "steady"];

const DEFAULT_RULES: Omit<HomeSecurityRulesV1, "siteId" | "updatedAt"> = {
  guardMode: "night_only",
  di1DurationSec: 45,
  di1LightMode: "steady",
  di2LightMode: "fast_blink",
  di2AlertDurationSec: 45,
  notifyDi1SilentLogOnly: true,
  notifyDi2InstantPush: true,
  securityPausedUntil: null,
};

const rulesCache = new Map<string, HomeSecurityRulesV1>();
let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function clampSec(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(10, Math.min(300, Math.round(n)));
}

function ensureSecurityRulesTableV1(): void {
  if (tableReady) return;
  tableReady = true;
  try {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS home_security_rules_v1 (
        site_id TEXT PRIMARY KEY,
        rules_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );
    `);
  } catch {
    /* DB 未初期化でも継続 */
  }
}

function parseRulesJson(
  siteId: string,
  raw: unknown
): HomeSecurityRulesV1 {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  }

  const guardMode = GUARD_MODES.includes(
    parsed.guardMode as HomeGuardModeV1
  )
    ? (parsed.guardMode as HomeGuardModeV1)
    : DEFAULT_RULES.guardMode;

  const di1LightMode = DI1_MODES.includes(
    parsed.di1LightMode as HomeDi1LightModeV1
  )
    ? (parsed.di1LightMode as HomeDi1LightModeV1)
    : DEFAULT_RULES.di1LightMode;

  const di2LightMode = DI2_MODES.includes(
    parsed.di2LightMode as HomeDi2LightModeV1
  )
    ? (parsed.di2LightMode as HomeDi2LightModeV1)
    : DEFAULT_RULES.di2LightMode;

  return {
    siteId,
    guardMode,
    di1DurationSec: clampSec(
      parsed.di1DurationSec,
      DEFAULT_RULES.di1DurationSec
    ),
    di1LightMode,
    di2LightMode,
    di2AlertDurationSec: clampSec(
      parsed.di2AlertDurationSec,
      DEFAULT_RULES.di2AlertDurationSec
    ),
    notifyDi1SilentLogOnly:
      parsed.notifyDi1SilentLogOnly !== undefined
        ? Boolean(parsed.notifyDi1SilentLogOnly)
        : DEFAULT_RULES.notifyDi1SilentLogOnly,
    notifyDi2InstantPush:
      parsed.notifyDi2InstantPush !== undefined
        ? Boolean(parsed.notifyDi2InstantPush)
        : DEFAULT_RULES.notifyDi2InstantPush,
    securityPausedUntil:
      typeof parsed.securityPausedUntil === "string"
        ? parsed.securityPausedUntil
        : null,
    updatedAt:
      typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : nowIso(),
  };
}

function persistRulesV1(rules: HomeSecurityRulesV1): void {
  try {
    ensureSecurityRulesTableV1();
    const db = getDatabase();
    db.prepare(
      `INSERT INTO home_security_rules_v1 (site_id, rules_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         rules_json = excluded.rules_json,
         updated_at = excluded.updated_at`
    ).run(
      rules.siteId,
      JSON.stringify(rules),
      rules.updatedAt
    );
  } catch {
    /* 永続化失敗でもメモリは保持 */
  }
}

/** 物件の防犯ルールを取得（なければデフォルト） */
export function getHomeSecurityRulesV1(
  siteId: string
): HomeSecurityRulesV1 {
  const sid = String(siteId ?? "").trim();
  if (!sid) {
    return parseRulesJson("", { ...DEFAULT_RULES, updatedAt: nowIso() });
  }

  const cached = rulesCache.get(sid);
  if (cached) return cached;

  try {
    ensureSecurityRulesTableV1();
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT rules_json FROM home_security_rules_v1 WHERE site_id = ?`
      )
      .get(sid) as { rules_json?: string } | undefined;
    if (row?.rules_json) {
      const rules = parseRulesJson(sid, row.rules_json);
      rulesCache.set(sid, rules);
      return rules;
    }
  } catch {
    /* フォールバック */
  }

  const rules: HomeSecurityRulesV1 = {
    siteId: sid,
    ...DEFAULT_RULES,
    updatedAt: nowIso(),
  };
  rulesCache.set(sid, rules);
  return rules;
}

/** 防犯ルールを merge 更新 */
export function updateHomeSecurityRulesV1(
  siteId: string,
  patch: HomeSecurityRulesPatchV1
): HomeSecurityRulesV1 {
  const sid = String(siteId ?? "").trim();
  findHomeSiteV1(sid);
  const current = getHomeSecurityRulesV1(sid);

  const guardMode =
    patch.guardMode && GUARD_MODES.includes(patch.guardMode)
      ? patch.guardMode
      : current.guardMode;

  const di1LightMode =
    patch.di1LightMode && DI1_MODES.includes(patch.di1LightMode)
      ? patch.di1LightMode
      : current.di1LightMode;

  const di2LightMode =
    patch.di2LightMode && DI2_MODES.includes(patch.di2LightMode)
      ? patch.di2LightMode
      : current.di2LightMode;

  const rules: HomeSecurityRulesV1 = {
    siteId: sid,
    guardMode,
    di1DurationSec:
      patch.di1DurationSec !== undefined
        ? clampSec(patch.di1DurationSec, current.di1DurationSec)
        : current.di1DurationSec,
    di1LightMode,
    di2LightMode,
    di2AlertDurationSec:
      patch.di2AlertDurationSec !== undefined
        ? clampSec(patch.di2AlertDurationSec, current.di2AlertDurationSec)
        : current.di2AlertDurationSec,
    notifyDi1SilentLogOnly:
      patch.notifyDi1SilentLogOnly !== undefined
        ? Boolean(patch.notifyDi1SilentLogOnly)
        : current.notifyDi1SilentLogOnly,
    notifyDi2InstantPush:
      patch.notifyDi2InstantPush !== undefined
        ? Boolean(patch.notifyDi2InstantPush)
        : current.notifyDi2InstantPush,
    securityPausedUntil:
      patch.securityPausedUntil !== undefined
        ? patch.securityPausedUntil
        : current.securityPausedUntil,
    updatedAt: nowIso(),
  };

  rulesCache.set(sid, rules);
  persistRulesV1(rules);
  return rules;
}

/** 警戒モードの日本語ラベル */
export function homeGuardModeLabelJaV1(mode: HomeGuardModeV1): string {
  const map: Record<HomeGuardModeV1, string> = {
    always: "24時間常時警戒",
    night_only: "夜間のみ",
    off: "警戒OFF",
  };
  return map[mode] ?? mode;
}

/** 現在時刻で警戒が有効か（JST） */
export function isHomeGuardActiveV1(
  rules: HomeSecurityRulesV1,
  at: Date = new Date()
): boolean {
  if (rules.guardMode === "off") return false;
  if (rules.guardMode === "always") return true;
  const jstHour = Number(
    at.toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Tokyo",
    })
  );
  return jstHour >= 20 || jstHour < 6;
}

/** 防犯ライト一時停止中か */
export function isHomeSecurityPausedV1(
  rules: HomeSecurityRulesV1,
  at: Date = new Date()
): boolean {
  if (!rules.securityPausedUntil) return false;
  const until = Date.parse(rules.securityPausedUntil);
  if (Number.isNaN(until)) return false;
  return until > at.getTime();
}

/** RP2350 ポーリング用 JSON を生成 */
export function buildHomeSecurityFirmwareRulesV1(
  siteId: string
): HomeSecurityFirmwareRulesV1 {
  const rules = getHomeSecurityRulesV1(siteId);
  const guardActive =
    isHomeGuardActiveV1(rules) && !isHomeSecurityPausedV1(rules);
  return {
    version: 1,
    siteId: rules.siteId,
    guardMode: rules.guardMode,
    guardActive,
    securityPaused: isHomeSecurityPausedV1(rules),
    di1DurationMs: rules.di1DurationSec * 1000,
    di1LightMode: rules.di1LightMode,
    di2LightMode: rules.di2LightMode,
    di2AlertDurationMs: rules.di2AlertDurationSec * 1000,
    perimeterFlagMs: 120_000,
    strobeOnMs: 250,
    strobeOffMs: 250,
  };
}

/** 防犯一時停止（分） */
export function pauseHomeSecurityV1(
  siteId: string,
  minutes: number
): HomeSecurityRulesV1 {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  return updateHomeSecurityRulesV1(siteId, {
    securityPausedUntil: until,
  });
}

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
export type HomeDi1LightModeV1 =
  | "steady"
  | "blink"
  | "strobe"
  | "off";

/** 段階侵入 DI2 時の外側100V（DO2）ライトモード */
export type HomeDi2LightModeV1 =
  | "fast_blink"
  | "steady"
  | "off";

/** 100V ライトモード（段階侵入・近接単独） */
export type HomeDi2Light100vModeV1 =
  | "steady"
  | "blink"
  | "off";

/** 近接単独 DI2 の外側100V（DO2）/100V（DO3）モード */
export type HomeDi2StandaloneLightModeV1 =
  | "steady"
  | "blink"
  | "off";

/** Web Push 通知条件トグル（緊急 / サイレント / OFF） */
export type HomeNotifyModeV1 = "critical" | "silent" | "off";

export interface HomeSecurityRulesV1 {
  siteId: string;
  /** 24時間常時 / 夜間のみ / 警戒OFF */
  guardMode: HomeGuardModeV1;
  /** DI1 点灯時間（秒）10〜180 */
  di1DurationSec: number;
  di1LightMode: HomeDi1LightModeV1;
  /** 段階侵入 DI1→DI2 接近判定制限（秒）30〜180 */
  perimeterTimeoutSec: number;
  /** DI2 段階侵入時の外側100V（DO2）ライト動作 */
  di2LightMode: HomeDi2LightModeV1;
  /** DI2 段階侵入時の 100V ライト動作 */
  di2Light100vMode: HomeDi2Light100vModeV1;
  /** DI2 威嚇発報時間（秒）10〜180 */
  di2AlertDurationSec: number;
  /** 近接単独 DI2 点灯時間（秒）10〜180 */
  di2StandaloneDurationSec: number;
  /** 近接単独 DI2 の外側100V（DO2）動作 */
  di2Standalone24vMode: HomeDi2StandaloneLightModeV1;
  /** 近接単独 DI2 の 100V 動作 */
  di2Standalone100vMode: HomeDi2StandaloneLightModeV1;
  /** DI1: サイレントログのみ（Push しない）— notifyDi1Mode と同期 */
  notifyDi1SilentLogOnly: boolean;
  /** DI2: 即時 Web Push 緊急通知 — notifyDi2Mode と同期 */
  notifyDi2InstantPush: boolean;
  /** DI1 単独の Push モード */
  notifyDi1Mode: HomeNotifyModeV1;
  /** DI1→DI2 段階侵入の Push モード */
  notifyStagedMode: HomeNotifyModeV1;
  /** DI2 単独の Push モード */
  notifyDi2Mode: HomeNotifyModeV1;
  /** シーン「ただいま」等の一時停止期限 */
  securityPausedUntil: string | null;
  updatedAt: string;
}

export interface HomeSecurityRulesPatchV1 {
  guardMode?: HomeGuardModeV1;
  di1DurationSec?: number;
  di1LightMode?: HomeDi1LightModeV1;
  perimeterTimeoutSec?: number;
  di2LightMode?: HomeDi2LightModeV1;
  di2Light100vMode?: HomeDi2Light100vModeV1;
  di2AlertDurationSec?: number;
  di2StandaloneDurationSec?: number;
  di2Standalone24vMode?: HomeDi2StandaloneLightModeV1;
  di2Standalone100vMode?: HomeDi2StandaloneLightModeV1;
  notifyDi1SilentLogOnly?: boolean;
  notifyDi2InstantPush?: boolean;
  notifyDi1Mode?: HomeNotifyModeV1;
  notifyStagedMode?: HomeNotifyModeV1;
  notifyDi2Mode?: HomeNotifyModeV1;
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
  di2Light100vMode: HomeDi2Light100vModeV1;
  di2AlertDurationMs: number;
  di2StandaloneDurationMs: number;
  di2Standalone24vMode: HomeDi2StandaloneLightModeV1;
  di2Standalone100vMode: HomeDi2StandaloneLightModeV1;
  perimeterFlagMs: number;
  strobeOnMs: number;
  strobeOffMs: number;
}

const GUARD_MODES: HomeGuardModeV1[] = ["always", "night_only", "off"];
const DI1_MODES: HomeDi1LightModeV1[] = [
  "steady",
  "blink",
  "strobe",
  "off",
];
const DI2_MODES: HomeDi2LightModeV1[] = [
  "fast_blink",
  "steady",
  "off",
];
const DI2_100V_MODES: HomeDi2Light100vModeV1[] = [
  "steady",
  "blink",
  "off",
];
const DI2_STANDALONE_MODES: HomeDi2StandaloneLightModeV1[] = [
  "steady",
  "blink",
  "off",
];
const NOTIFY_MODES: HomeNotifyModeV1[] = ["critical", "silent", "off"];

export function isHomeNotifyModeV1(value: unknown): value is HomeNotifyModeV1 {
  return (
    typeof value === "string" &&
    NOTIFY_MODES.includes(value as HomeNotifyModeV1)
  );
}

/** Push するモードか（critical のみ） */
export function isHomeNotifyPushEnabledV1(mode: HomeNotifyModeV1): boolean {
  return mode === "critical";
}

function parseNotifyMode(
  value: unknown,
  fallback: HomeNotifyModeV1
): HomeNotifyModeV1 {
  return isHomeNotifyModeV1(value) ? value : fallback;
}

const DEFAULT_RULES: Omit<HomeSecurityRulesV1, "siteId" | "updatedAt"> = {
  guardMode: "night_only",
  di1DurationSec: 45,
  di1LightMode: "steady",
  perimeterTimeoutSec: 120,
  di2LightMode: "fast_blink",
  di2Light100vMode: "steady",
  di2AlertDurationSec: 45,
  di2StandaloneDurationSec: 45,
  di2Standalone24vMode: "steady",
  di2Standalone100vMode: "steady",
  notifyDi1SilentLogOnly: true,
  notifyDi2InstantPush: true,
  notifyDi1Mode: "silent",
  notifyStagedMode: "critical",
  notifyDi2Mode: "critical",
  securityPausedUntil: null,
};

const rulesCache = new Map<string, HomeSecurityRulesV1>();
let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

function clampSec(
  value: unknown,
  fallback: number,
  min = 10,
  max = 180
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampPerimeterSec(value: unknown, fallback: number): number {
  return clampSec(value, fallback, 30, 180);
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

  const di2Light100vMode = DI2_100V_MODES.includes(
    parsed.di2Light100vMode as HomeDi2Light100vModeV1
  )
    ? (parsed.di2Light100vMode as HomeDi2Light100vModeV1)
    : DEFAULT_RULES.di2Light100vMode;

  const di2Standalone24vMode = DI2_STANDALONE_MODES.includes(
    parsed.di2Standalone24vMode as HomeDi2StandaloneLightModeV1
  )
    ? (parsed.di2Standalone24vMode as HomeDi2StandaloneLightModeV1)
    : DEFAULT_RULES.di2Standalone24vMode;

  const di2Standalone100vMode = DI2_STANDALONE_MODES.includes(
    parsed.di2Standalone100vMode as HomeDi2StandaloneLightModeV1
  )
    ? (parsed.di2Standalone100vMode as HomeDi2StandaloneLightModeV1)
    : DEFAULT_RULES.di2Standalone100vMode;

  const di2AlertDurationSec = clampSec(
    parsed.di2AlertDurationSec,
    DEFAULT_RULES.di2AlertDurationSec
  );

  const notifyDi1SilentLogOnly =
    parsed.notifyDi1SilentLogOnly !== undefined
      ? Boolean(parsed.notifyDi1SilentLogOnly)
      : DEFAULT_RULES.notifyDi1SilentLogOnly;
  const notifyDi2InstantPush =
    parsed.notifyDi2InstantPush !== undefined
      ? Boolean(parsed.notifyDi2InstantPush)
      : DEFAULT_RULES.notifyDi2InstantPush;

  /* 新モード優先。未設定時は旧 boolean から復元 */
  const notifyDi1Mode = parseNotifyMode(
    parsed.notifyDi1Mode,
    notifyDi1SilentLogOnly ? "silent" : "critical"
  );
  const notifyStagedMode = parseNotifyMode(
    parsed.notifyStagedMode,
    DEFAULT_RULES.notifyStagedMode
  );
  const notifyDi2Mode = parseNotifyMode(
    parsed.notifyDi2Mode,
    notifyDi2InstantPush ? "critical" : "off"
  );

  return {
    siteId,
    guardMode,
    di1DurationSec: clampSec(
      parsed.di1DurationSec,
      DEFAULT_RULES.di1DurationSec
    ),
    di1LightMode,
    perimeterTimeoutSec: clampPerimeterSec(
      parsed.perimeterTimeoutSec,
      DEFAULT_RULES.perimeterTimeoutSec
    ),
    di2LightMode,
    di2Light100vMode,
    di2AlertDurationSec,
    di2StandaloneDurationSec: clampSec(
      parsed.di2StandaloneDurationSec ?? parsed.di2AlertDurationSec,
      di2AlertDurationSec
    ),
    di2Standalone24vMode,
    di2Standalone100vMode,
    notifyDi1Mode,
    notifyStagedMode,
    notifyDi2Mode,
    notifyDi1SilentLogOnly: !isHomeNotifyPushEnabledV1(notifyDi1Mode),
    notifyDi2InstantPush: isHomeNotifyPushEnabledV1(notifyDi2Mode),
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

  const di2Light100vMode =
    patch.di2Light100vMode &&
    DI2_100V_MODES.includes(patch.di2Light100vMode)
      ? patch.di2Light100vMode
      : current.di2Light100vMode;

  const di2Standalone24vMode =
    patch.di2Standalone24vMode &&
    DI2_STANDALONE_MODES.includes(patch.di2Standalone24vMode)
      ? patch.di2Standalone24vMode
      : current.di2Standalone24vMode;

  const di2Standalone100vMode =
    patch.di2Standalone100vMode &&
    DI2_STANDALONE_MODES.includes(patch.di2Standalone100vMode)
      ? patch.di2Standalone100vMode
      : current.di2Standalone100vMode;

  const di2AlertDurationSec =
    patch.di2AlertDurationSec !== undefined
      ? clampSec(patch.di2AlertDurationSec, current.di2AlertDurationSec)
      : current.di2AlertDurationSec;

  let notifyDi1Mode = current.notifyDi1Mode;
  if (isHomeNotifyModeV1(patch.notifyDi1Mode)) {
    notifyDi1Mode = patch.notifyDi1Mode;
  } else if (patch.notifyDi1SilentLogOnly !== undefined) {
    notifyDi1Mode = Boolean(patch.notifyDi1SilentLogOnly)
      ? "silent"
      : "critical";
  }

  let notifyStagedMode = current.notifyStagedMode;
  if (isHomeNotifyModeV1(patch.notifyStagedMode)) {
    notifyStagedMode = patch.notifyStagedMode;
  }

  let notifyDi2Mode = current.notifyDi2Mode;
  if (isHomeNotifyModeV1(patch.notifyDi2Mode)) {
    notifyDi2Mode = patch.notifyDi2Mode;
  } else if (patch.notifyDi2InstantPush !== undefined) {
    notifyDi2Mode = Boolean(patch.notifyDi2InstantPush) ? "critical" : "off";
  }

  const rules: HomeSecurityRulesV1 = {
    siteId: sid,
    guardMode,
    di1DurationSec:
      patch.di1DurationSec !== undefined
        ? clampSec(patch.di1DurationSec, current.di1DurationSec)
        : current.di1DurationSec,
    di1LightMode,
    perimeterTimeoutSec:
      patch.perimeterTimeoutSec !== undefined
        ? clampPerimeterSec(
            patch.perimeterTimeoutSec,
            current.perimeterTimeoutSec
          )
        : current.perimeterTimeoutSec,
    di2LightMode,
    di2Light100vMode,
    di2AlertDurationSec,
    di2StandaloneDurationSec:
      patch.di2StandaloneDurationSec !== undefined
        ? clampSec(
            patch.di2StandaloneDurationSec,
            current.di2StandaloneDurationSec
          )
        : current.di2StandaloneDurationSec,
    di2Standalone24vMode,
    di2Standalone100vMode,
    notifyDi1Mode,
    notifyStagedMode,
    notifyDi2Mode,
    notifyDi1SilentLogOnly: !isHomeNotifyPushEnabledV1(notifyDi1Mode),
    notifyDi2InstantPush: isHomeNotifyPushEnabledV1(notifyDi2Mode),
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
    di2Light100vMode: rules.di2Light100vMode,
    di2AlertDurationMs: rules.di2AlertDurationSec * 1000,
    di2StandaloneDurationMs: rules.di2StandaloneDurationSec * 1000,
    di2Standalone24vMode: rules.di2Standalone24vMode,
    di2Standalone100vMode: rules.di2Standalone100vMode,
    perimeterFlagMs: rules.perimeterTimeoutSec * 1000,
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

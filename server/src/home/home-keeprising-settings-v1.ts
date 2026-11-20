/**
 * Keep Rising の稼働設定。
 * 決定ボタンからの保存だけを書く。
 * スライダー操作では保存しない。
 */

import { getDatabase } from "../db/database.js";
import {
  ASTRO_DEFAULT_LAT_V1,
  ASTRO_DEFAULT_LON_V1,
  ASTRO_DEFAULT_TZ_SEC_V1,
  buildAstroWindowV1,
  clampAstroOffsetMinV1,
} from "./astro-schedule-v1.js";

/** 循環参照を避けるためサイト ID は直書き */
const SEC_JP_KEEPRISING_SITE_ID_V1 = "SEC-JP-KEEPRISING-001";

export type KeepRisingFloodModeV1 = "steady" | "blink";

/** away=警戒ON / home=通知のみ / disarmed=警戒OFF */
export type KeepRisingGuardModeV1 = "away" | "home" | "disarmed";

/**
 * staged_steady 段階点灯 / staged_blink 威嚇点滅
 * full すぐ全警戒 / notify 通知のみ
 */
export type KeepRisingBeamLinkModeV1 =
  | "staged_steady"
  | "staged_blink"
  | "full"
  | "notify";

/** manual は保存した時刻。astronomical は日没追従 */
export type KeepRisingLightingScheduleModeV1 = "manual" | "astronomical";

export interface KeepRisingFloodModesV1 {
  do1: KeepRisingFloodModeV1;
  do2: KeepRisingFloodModeV1;
  do3: KeepRisingFloodModeV1;
  do7: KeepRisingFloodModeV1;
}

export interface KeepRisingCustomerSettingsV1 {
  siteId: string;
  scheduleStart: string;
  scheduleEnd: string;
  durationSec: number;
  floodModes: KeepRisingFloodModesV1;
  guardMode: KeepRisingGuardModeV1;
  /** 稼働時間外でもセンサー連動リレーを出す */
  daytimeRelayTest: boolean;
  /** 段階ビーム連動。未保存の行は標準点灯 */
  beamLinkMode: KeepRisingBeamLinkModeV1;
  /** DI2 から DI3 までの秒。初期値は 60 */
  stageWindowSec: number;
  /** 未保存の行は手動の 20:00〜06:00 */
  lightingScheduleMode: KeepRisingLightingScheduleModeV1;
  sunsetOffsetMin: number;
  sunriseOffsetMin: number;
  /** 未設定は ON。OFF でも手動テストは動く */
  patliteThreatEnabled: boolean;
  /** 各ビームのスマホ通知。未設定は受け取る */
  notifyDi1: boolean;
  notifyDi2: boolean;
  notifyDi3: boolean;
  updatedAt: string;
}

const DO_MIN_SEC = 5;
const DO_MAX_SEC = 180;
const STAGE_WINDOW_MIN_SEC = 5;
const STAGE_WINDOW_MAX_SEC = 300;
const DURATION_PRESETS_V1 = [5, 15, 45, 90, 120] as const;

/** 5 / 15 / 45 / 90 / 120 の近い方。同じ距離なら長い方 */
export function snapKeepRisingDurationPresetV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 45;
  let best: number = DURATION_PRESETS_V1[0];
  let dist = Math.abs(n - best);
  for (const preset of DURATION_PRESETS_V1) {
    const gap = Math.abs(n - preset);
    if (gap <= dist) {
      best = preset;
      dist = gap;
    }
  }
  return best;
}

let tableReady = false;

function nowIso(): string {
  return new Date().toISOString();
}

export function clampKeepRisingDurationSecV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  const sec = Math.round(n);
  if (sec < DO_MIN_SEC) return DO_MIN_SEC;
  if (sec > DO_MAX_SEC) return DO_MAX_SEC;
  return sec;
}

export function parseKeepRisingHmV1(
  raw: unknown,
  fallback: string
): string {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function keepRisingHmToMinutesV1(hm: string): number {
  const [hour, minute] = hm.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** 日をまたぐ時間帯。終了ちょうどは時間外 */
export function isKeepRisingScheduleOpenV1(
  at: Date,
  scheduleStart: string,
  scheduleEnd: string
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0"
  );
  const now = ((hour % 24) * 60 + (minute % 60)) % 1440;
  const start = keepRisingHmToMinutesV1(scheduleStart);
  const end = keepRisingHmToMinutesV1(scheduleEnd);
  if (start === end) return true;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

function floodMode(raw: unknown): KeepRisingFloodModeV1 {
  return String(raw ?? "").trim().toLowerCase() === "blink"
    ? "blink"
    : "steady";
}

export function parseKeepRisingGuardModeV1(
  raw: unknown,
  fallback: KeepRisingGuardModeV1 = "away"
): KeepRisingGuardModeV1 {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "home" || text === "notify" || text === "notify_only") {
    return "home";
  }
  if (text === "disarmed" || text === "off") return "disarmed";
  if (text === "away" || text === "on") return "away";
  return fallback;
}

export function parseKeepRisingBeamLinkModeV1(
  raw: unknown
): KeepRisingBeamLinkModeV1 {
  const text = String(raw ?? "").trim().toLowerCase();
  if (
    text === "staged_blink" ||
    text === "blink" ||
    text === "threat" ||
    text === "two_stage_blink"
  ) {
    return "staged_blink";
  }
  if (text === "full" || text === "direct" || text === "immediate") {
    return "full";
  }
  if (text === "notify" || text === "silent" || text === "notify_only") {
    return "notify";
  }
  return "staged_steady";
}

/** DI2→DI3 の秒。未設定は 60。5〜300 に収める */
export function clampKeepRisingStageWindowSecV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 60;
  const sec = Math.round(n);
  if (sec < STAGE_WINDOW_MIN_SEC) return STAGE_WINDOW_MIN_SEC;
  if (sec > STAGE_WINDOW_MAX_SEC) return STAGE_WINDOW_MAX_SEC;
  return sec;
}

function parseDaytimeRelayTestV1(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  const text = String(raw ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "on" || text === "yes";
}

/** キーが無いときは従来どおり。明示の OFF だけ切る */
function parseOptionalBoolV1(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const text = String(raw).trim().toLowerCase();
  if (text === "1" || text === "true" || text === "on" || text === "yes") {
    return true;
  }
  if (text === "0" || text === "false" || text === "off" || text === "no") {
    return false;
  }
  return fallback;
}

function parseLightingModeV1(
  raw: unknown
): KeepRisingLightingScheduleModeV1 {
  return String(raw ?? "").trim().toLowerCase() === "astronomical"
    ? "astronomical"
    : "manual";
}

function defaultModes(): KeepRisingFloodModesV1 {
  return { do1: "steady", do2: "steady", do3: "steady", do7: "steady" };
}

function defaultSettings(siteId: string): KeepRisingCustomerSettingsV1 {
  return {
    siteId: siteId || SEC_JP_KEEPRISING_SITE_ID_V1,
    scheduleStart: "20:00",
    scheduleEnd: "06:00",
    durationSec: 30,
    floodModes: defaultModes(),
    guardMode: "away",
    daytimeRelayTest: false,
    beamLinkMode: "staged_steady",
    stageWindowSec: 60,
    lightingScheduleMode: "manual",
    sunsetOffsetMin: -15,
    sunriseOffsetMin: 15,
    patliteThreatEnabled: true,
    notifyDi1: true,
    notifyDi2: true,
    notifyDi3: true,
    updatedAt: nowIso(),
  };
}

function ensureTable(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS home_keeprising_settings_v1 (
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
): KeepRisingCustomerSettingsV1 {
  const base = defaultSettings(siteId);
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const modes = (row.floodModes ?? {}) as Record<string, unknown>;
  return {
    siteId,
    scheduleStart: parseKeepRisingHmV1(
      row.scheduleStart,
      base.scheduleStart
    ),
    scheduleEnd: parseKeepRisingHmV1(row.scheduleEnd, base.scheduleEnd),
    durationSec: clampKeepRisingDurationSecV1(
      row.durationSec ?? base.durationSec
    ),
    floodModes: {
      do1: floodMode(modes.do1 ?? modes["1"]),
      do2: floodMode(modes.do2 ?? modes["2"]),
      do3: floodMode(modes.do3 ?? modes["3"]),
      do7: floodMode(modes.do7 ?? modes["7"]),
    },
    guardMode: parseKeepRisingGuardModeV1(row.guardMode, "away"),
    daytimeRelayTest: parseDaytimeRelayTestV1(row.daytimeRelayTest),
    beamLinkMode: parseKeepRisingBeamLinkModeV1(
      row.beamLinkMode ?? row.beamMode ?? base.beamLinkMode
    ),
    stageWindowSec: clampKeepRisingStageWindowSecV1(
      row.stageWindowSec ?? row.di2ToDi3Sec ?? base.stageWindowSec
    ),
    lightingScheduleMode: parseLightingModeV1(row.lightingScheduleMode),
    sunsetOffsetMin: clampAstroOffsetMinV1(
      row.sunsetOffsetMin,
      base.sunsetOffsetMin
    ),
    sunriseOffsetMin: clampAstroOffsetMinV1(
      row.sunriseOffsetMin,
      base.sunriseOffsetMin
    ),
    patliteThreatEnabled: parseOptionalBoolV1(
      row.patliteThreatEnabled,
      true
    ),
    notifyDi1: parseOptionalBoolV1(row.notifyDi1, true),
    notifyDi2: parseOptionalBoolV1(row.notifyDi2, true),
    notifyDi3: parseOptionalBoolV1(row.notifyDi3, true),
    updatedAt:
      typeof row.updatedAt === "string" ? row.updatedAt : base.updatedAt,
  };
}

export function getKeepRisingCustomerSettingsV1(
  siteId?: string | null
): KeepRisingCustomerSettingsV1 {
  const id = String(siteId || SEC_JP_KEEPRISING_SITE_ID_V1).trim();
  try {
    ensureTable();
    const row = getDatabase()
      .prepare(
        `SELECT config_json FROM home_keeprising_settings_v1
         WHERE site_id = ?`
      )
      .get(id) as { config_json?: string } | undefined;
    if (!row?.config_json) return defaultSettings(id);
    return parseSettings(id, JSON.parse(row.config_json));
  } catch {
    return defaultSettings(id);
  }
}

export function saveKeepRisingCustomerSettingsV1(input: {
  siteId?: string | null;
  scheduleStart?: unknown;
  scheduleEnd?: unknown;
  durationSec?: unknown;
  floodModes?: unknown;
  guardMode?: unknown;
  daytimeRelayTest?: unknown;
  beamLinkMode?: unknown;
  stageWindowSec?: unknown;
  lightingScheduleMode?: unknown;
  sunsetOffsetMin?: unknown;
  sunriseOffsetMin?: unknown;
  patliteThreatEnabled?: unknown;
  notifyDi1?: unknown;
  notifyDi2?: unknown;
  notifyDi3?: unknown;
}): KeepRisingCustomerSettingsV1 {
  const id = String(input.siteId || SEC_JP_KEEPRISING_SITE_ID_V1).trim();
  const prev = getKeepRisingCustomerSettingsV1(id);
  const incoming =
    input.floodModes && typeof input.floodModes === "object"
      ? (input.floodModes as Record<string, unknown>)
      : null;
  const next: KeepRisingCustomerSettingsV1 = {
    siteId: id,
    scheduleStart:
      input.scheduleStart === undefined
        ? prev.scheduleStart
        : parseKeepRisingHmV1(input.scheduleStart, prev.scheduleStart),
    scheduleEnd:
      input.scheduleEnd === undefined
        ? prev.scheduleEnd
        : parseKeepRisingHmV1(input.scheduleEnd, prev.scheduleEnd),
    durationSec:
      input.durationSec === undefined
        ? prev.durationSec
        : snapKeepRisingDurationPresetV1(input.durationSec),
    floodModes: incoming
      ? {
          do1: floodMode(incoming.do1 ?? incoming["1"] ?? prev.floodModes.do1),
          do2: floodMode(incoming.do2 ?? incoming["2"] ?? prev.floodModes.do2),
          do3: floodMode(incoming.do3 ?? incoming["3"] ?? prev.floodModes.do3),
          do7: floodMode(incoming.do7 ?? incoming["7"] ?? prev.floodModes.do7),
        }
      : prev.floodModes,
    guardMode:
      input.guardMode === undefined
        ? prev.guardMode
        : parseKeepRisingGuardModeV1(input.guardMode, prev.guardMode),
    daytimeRelayTest:
      input.daytimeRelayTest === undefined
        ? prev.daytimeRelayTest
        : parseDaytimeRelayTestV1(input.daytimeRelayTest),
    beamLinkMode:
      input.beamLinkMode === undefined
        ? prev.beamLinkMode
        : parseKeepRisingBeamLinkModeV1(input.beamLinkMode),
    stageWindowSec:
      input.stageWindowSec === undefined
        ? prev.stageWindowSec
        : clampKeepRisingStageWindowSecV1(input.stageWindowSec),
    lightingScheduleMode:
      input.lightingScheduleMode === undefined
        ? prev.lightingScheduleMode
        : parseLightingModeV1(input.lightingScheduleMode),
    sunsetOffsetMin:
      input.sunsetOffsetMin === undefined
        ? prev.sunsetOffsetMin
        : clampAstroOffsetMinV1(
            input.sunsetOffsetMin,
            prev.sunsetOffsetMin
          ),
    sunriseOffsetMin:
      input.sunriseOffsetMin === undefined
        ? prev.sunriseOffsetMin
        : clampAstroOffsetMinV1(
            input.sunriseOffsetMin,
            prev.sunriseOffsetMin
          ),
    patliteThreatEnabled:
      input.patliteThreatEnabled === undefined
        ? prev.patliteThreatEnabled
        : parseOptionalBoolV1(
            input.patliteThreatEnabled,
            prev.patliteThreatEnabled
          ),
    notifyDi1:
      input.notifyDi1 === undefined
        ? prev.notifyDi1
        : parseOptionalBoolV1(input.notifyDi1, prev.notifyDi1),
    notifyDi2:
      input.notifyDi2 === undefined
        ? prev.notifyDi2
        : parseOptionalBoolV1(input.notifyDi2, prev.notifyDi2),
    notifyDi3:
      input.notifyDi3 === undefined
        ? prev.notifyDi3
        : parseOptionalBoolV1(input.notifyDi3, prev.notifyDi3),
    updatedAt: nowIso(),
  };
  ensureTable();
  getDatabase()
    .prepare(
      `INSERT INTO home_keeprising_settings_v1
         (site_id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    )
    .run(id, JSON.stringify(next), next.updatedAt);
  return next;
}

/**
 * 天文タイマーの本日分。
 * 手動の保存時刻はここでは変えない。
 */
export function keepRisingAstroWindowV1(
  settings: KeepRisingCustomerSettingsV1,
  at: Date = new Date()
) {
  if (settings.lightingScheduleMode !== "astronomical") return null;
  return buildAstroWindowV1({
    at,
    latitude: ASTRO_DEFAULT_LAT_V1,
    longitude: ASTRO_DEFAULT_LON_V1,
    timezoneOffsetSec: ASTRO_DEFAULT_TZ_SEC_V1,
    sunsetOffsetMin: settings.sunsetOffsetMin,
    sunriseOffsetMin: settings.sunriseOffsetMin,
  });
}

/**
 * 実機へ渡す設定。
 * 天文のときだけ、今日の開始と終了を載せる。
 * 保存済みの手動時刻は上書きしない。
 */
export function deliverKeepRisingDeviceSettingsV1(
  at: Date = new Date()
): KeepRisingCustomerSettingsV1 {
  const settings = getKeepRisingCustomerSettingsV1();
  const astro = keepRisingAstroWindowV1(settings, at);
  if (!astro) return settings;
  return {
    ...settings,
    scheduleStart: astro.startHm,
    scheduleEnd: astro.endHm,
  };
}

/** テスト用。この物件の表だけ消す */
export function resetKeepRisingSettingsForTestV1(): void {
  try {
    ensureTable();
    getDatabase()
      .prepare(`DELETE FROM home_keeprising_settings_v1`)
      .run();
  } catch {
    /* 未作成でもテストは続行 */
  }
}

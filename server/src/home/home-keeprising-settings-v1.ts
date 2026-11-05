/**
 * Keep Rising の稼働設定。
 * 決定ボタンからの保存だけを書く。
 * スライダー操作では保存しない。
 */

import { getDatabase } from "../db/database.js";

/** 循環参照を避けるためサイト ID は直書き */
const SEC_JP_KEEPRISING_SITE_ID_V1 = "SEC-JP-KEEPRISING-001";

export type KeepRisingFloodModeV1 = "steady" | "blink";

/** away=警戒ON / home=通知のみ / disarmed=警戒OFF */
export type KeepRisingGuardModeV1 = "away" | "home" | "disarmed";

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
  updatedAt: string;
}

const DO_MIN_SEC = 5;
const DO_MAX_SEC = 180;
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

function parseDaytimeRelayTestV1(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  const text = String(raw ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "on" || text === "yes";
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

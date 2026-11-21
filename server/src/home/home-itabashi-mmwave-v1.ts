/**
 * 板橋自宅 GPIO44 のミリ波レーダー。
 * 滞留秒は検知行とは別表に置く。
 * DI/DO の保存設定は読みも書きもしない。
 */

import { getDatabase } from "../db/database.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "./home-sites-v1.js";
import { isMaintenanceActiveV1 } from "./home-ops-safety-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import type { DeliveryResult } from "../notification/types.js";
import { getTislyOtaVersionV1 } from "../firmware/tisly-rp2350-ota-v1.js";
import {
  getHomeSecurityRulesV1,
  isHomeSecurityArmedV1,
} from "./home-security-rules-v1.js";
import { insertCustomerNotificationV1 } from "../shared/customer/customer-notifications-v1.js";
import {
  clearMmwaveSecurityAlarmV1,
  listSecurityAlarmLogsV1,
  recordMmwaveSecurityAlarmV1,
} from "../security-floor/security-floor-soc-v1.js";

export const MMWAVE_SENSOR_ID_V1 = "mmwave_gpio44";
export const MMWAVE_LABEL_V1 = "ミリ波レーダー（GPIO44）";
export const MMWAVE_DEFAULT_DWELL_SEC_V1 = 3;
export const MMWAVE_PUSH_COOLDOWN_MS_V1 = 12_000;

export type MmwavePhaseV1 = "clear" | "approach" | "dwell";

export interface MmwaveStatusV1 {
  ok: true;
  siteId: string;
  customerCode: "TOMS001";
  sensorId: typeof MMWAVE_SENSOR_ID_V1;
  label: string;
  rangeLabel: string;
  phase: MmwavePhaseV1;
  phaseLabel: string;
  dwellSec: number;
  mmwaveHoldSeconds: number;
  gpioLevel: 0 | 1;
  gpio44Level: 0 | 1 | null;
  gpioRawLabel: string;
  gpio44Error: string;
  firmwareVersion: string | null;
  firmwareLabel: string;
  heldMs: number;
  highSince: string | null;
  updatedAt: string | null;
  lastEventAt: string | null;
  lastEventLabel: string;
}

const lastPushAt = new Map<string, number>();
let tableReady = false;

function ensureTable(): void {
  if (tableReady) return;
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_mmwave_gpio44_v1 (
      site_id TEXT PRIMARY KEY,
      phase TEXT NOT NULL,
      dwell_sec INTEGER NOT NULL,
      updated_at TEXT,
      last_event TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_mmwave_hold_v1 (
      site_id TEXT PRIMARY KEY,
      hold_sec INTEGER NOT NULL,
      updated_at TEXT
    )
  `);
  const alters = [
    "ALTER TABLE home_mmwave_gpio44_v1 ADD COLUMN gpio_level INTEGER",
    "ALTER TABLE home_mmwave_gpio44_v1 ADD COLUMN held_ms INTEGER",
    "ALTER TABLE home_mmwave_gpio44_v1 ADD COLUMN high_since TEXT",
    "ALTER TABLE home_mmwave_gpio44_v1 ADD COLUMN last_event_at TEXT",
    "ALTER TABLE home_mmwave_gpio44_v1 ADD COLUMN pin_error TEXT",
    "ALTER TABLE home_mmwave_gpio44_v1 ADD COLUMN firmware_version TEXT",
  ];
  for (const sql of alters) {
    try {
      db.exec(sql);
    } catch {
      /* 追加済みの列は残す */
    }
  }
  tableReady = true;
}

export function clampMmwaveDwellSecV1(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return MMWAVE_DEFAULT_DWELL_SEC_V1;
  const sec = Math.round(n);
  if (sec < 1) return 1;
  if (sec > 300) return 300;
  return sec;
}

export function holdSecondsFromBodyV1(body: {
  mmwaveHoldSeconds?: unknown;
  holdSec?: unknown;
  dwellSec?: unknown;
}): number | null {
  if (body.mmwaveHoldSeconds != null && body.mmwaveHoldSeconds !== "") {
    return clampMmwaveDwellSecV1(body.mmwaveHoldSeconds);
  }
  if (body.holdSec != null && body.holdSec !== "") {
    return clampMmwaveDwellSecV1(body.holdSec);
  }
  if (body.dwellSec != null && body.dwellSec !== "") {
    return clampMmwaveDwellSecV1(body.dwellSec);
  }
  return null;
}

export function mmwavePhaseLabelV1(
  phase: MmwavePhaseV1,
  heldSec = 0,
  holdSec = MMWAVE_DEFAULT_DWELL_SEC_V1
): string {
  if (phase === "dwell") return "🚨 滞留警報発報中！";
  if (phase === "approach") {
    const held = Math.max(0, Math.floor(heldSec));
    const hold = clampMmwaveDwellSecV1(holdSec);
    return `🟡 接近検知中（経過: ${held}秒 / 判定: ${hold}秒）`;
  }
  return "🟢 クリア（待機中）";
}

function isItabashiSite(siteId: string): boolean {
  const id = siteId.trim();
  return (
    id === HOME_ITABASHI_LIVE_SITE_ID_V1 ||
    id === "SEC-JP-ITABASHI-LIVE" ||
    id === "TOMS001" ||
    id === "HOME001"
  );
}

function canonicalSite(siteId: string | undefined): string {
  const id = String(siteId ?? "").trim();
  if (!id || isItabashiSite(id)) return HOME_ITABASHI_LIVE_SITE_ID_V1;
  return id;
}

function readHoldSec(siteId: string, fallback: number): number {
  ensureTable();
  const row = getDatabase()
    .prepare(
      `SELECT hold_sec FROM home_mmwave_hold_v1 WHERE site_id = ?`
    )
    .get(siteId) as { hold_sec?: number } | undefined;
  if (row && row.hold_sec != null) {
    return clampMmwaveDwellSecV1(row.hold_sec);
  }
  return clampMmwaveDwellSecV1(fallback);
}

function parseGpioLevel(raw: unknown): 0 | 1 | null {
  if (raw === 1 || raw === "1" || raw === true) return 1;
  if (raw === 0 || raw === "0" || raw === false) return 0;
  return null;
}

function textOrNull(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  return text ? text.slice(0, 160) : null;
}

function runningFirmwareV1(): string | null {
  try {
    const ota = getTislyOtaVersionV1({ siteKey: "itabashi" });
    return textOrNull(ota.runningVersion);
  } catch {
    return null;
  }
}

function gpioRawLabelV1(level: 0 | 1 | null): string {
  if (level === 1) return "GPIO44 生入力値: HIGH (1)";
  if (level === 0) return "GPIO44 生入力値: LOW (0)";
  return "GPIO44 生入力値: 未取得";
}

function firmwareLabelV1(version: string | null): string {
  if (!version) return "実機バージョン: 未取得";
  return `実機バージョン: v${version.replace(/^v/i, "")}`;
}

function readLive(siteId: string): {
  phase: MmwavePhaseV1;
  dwellSec: number;
  gpioLevel: 0 | 1;
  gpio44Level: 0 | 1 | null;
  gpio44Error: string;
  firmwareVersion: string | null;
  heldMs: number;
  highSince: string | null;
  updatedAt: string | null;
  lastEventAt: string | null;
} {
  ensureTable();
  const row = getDatabase()
    .prepare(
      `SELECT phase, dwell_sec, gpio_level, held_ms,
              high_since, updated_at, last_event_at,
              pin_error, firmware_version
       FROM home_mmwave_gpio44_v1 WHERE site_id = ?`
    )
    .get(siteId) as
    | {
        phase?: string;
        dwell_sec?: number;
        gpio_level?: number | null;
        held_ms?: number;
        high_since?: string;
        updated_at?: string;
        last_event_at?: string;
        pin_error?: string | null;
        firmware_version?: string | null;
      }
    | undefined;
  const phase = row?.phase;
  const safe: MmwavePhaseV1 =
    phase === "approach" || phase === "dwell" || phase === "clear"
      ? phase
      : "clear";
  const known = parseGpioLevel(row?.gpio_level);
  return {
    phase: safe,
    dwellSec: readHoldSec(siteId, row?.dwell_sec ?? MMWAVE_DEFAULT_DWELL_SEC_V1),
    gpioLevel: known === 1 ? 1 : 0,
    gpio44Level: known,
    gpio44Error: String(row?.pin_error ?? ""),
    firmwareVersion:
      textOrNull(row?.firmware_version) || runningFirmwareV1(),
    heldMs: Math.max(0, Number(row?.held_ms) || 0),
    highSince: row?.high_since ?? null,
    updatedAt: row?.updated_at ?? null,
    lastEventAt: row?.last_event_at ?? null,
  };
}

function jstClock(iso: string | null): string {
  if (!iso) return "最終反応: 未検知";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "最終反応: 未検知";
  const clock = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return clock;
}

function statusFrom(
  siteId: string,
  live: ReturnType<typeof readLive>
): MmwaveStatusV1 {
  const heldSec = Math.floor(live.heldMs / 1000);
  const kind =
    live.phase === "dwell"
      ? "滞留確定"
      : live.phase === "approach"
        ? "接近"
        : "クリア";
  const clock = jstClock(live.lastEventAt);
  return {
    ok: true,
    siteId,
    customerCode: "TOMS001",
    sensorId: MMWAVE_SENSOR_ID_V1,
    label: MMWAVE_LABEL_V1,
    rangeLabel: "2.25m設定",
    phase: live.phase,
    phaseLabel: mmwavePhaseLabelV1(live.phase, heldSec, live.dwellSec),
    dwellSec: live.dwellSec,
    mmwaveHoldSeconds: live.dwellSec,
    gpioLevel: live.gpioLevel,
    gpio44Level: live.gpio44Level,
    gpioRawLabel: gpioRawLabelV1(live.gpio44Level),
    gpio44Error: live.gpio44Error,
    firmwareVersion: live.firmwareVersion,
    firmwareLabel: firmwareLabelV1(live.firmwareVersion),
    heldMs: live.heldMs,
    highSince: live.highSince,
    updatedAt: live.updatedAt,
    lastEventAt: live.lastEventAt,
    lastEventLabel: live.lastEventAt
      ? `最終反応: ${clock}（${kind}）`
      : "最終反応: 未検知",
  };
}

export function getItabashiMmwaveStatusV1(siteId?: string): MmwaveStatusV1 {
  const id = canonicalSite(siteId);
  return statusFrom(id, readLive(id));
}

export function saveItabashiMmwaveDwellSecV1(
  dwellSec: unknown,
  siteId?: string
): MmwaveStatusV1 {
  const id = canonicalSite(siteId);
  const sec =
    dwellSec == null || dwellSec === ""
      ? readHoldSec(id, MMWAVE_DEFAULT_DWELL_SEC_V1)
      : clampMmwaveDwellSecV1(dwellSec);
  const now = new Date().toISOString();
  ensureTable();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO home_mmwave_hold_v1 (site_id, hold_sec, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET
       hold_sec = excluded.hold_sec,
       updated_at = excluded.updated_at`
  ).run(id, sec, now);
  const live = readLive(id);
  db.prepare(
    `INSERT INTO home_mmwave_gpio44_v1
      (site_id, phase, dwell_sec, updated_at, last_event, gpio_level, held_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET
       dwell_sec = excluded.dwell_sec`
  ).run(
    id,
    live.phase,
    sec,
    live.updatedAt,
    null,
    live.gpioLevel,
    live.heldMs
  );
  return getItabashiMmwaveStatusV1(id);
}

export function itabashiMmwaveFirmwareExtraV1(siteId: string): {
  mmwaveDwellSec: number;
  mmwaveHoldSeconds: number;
  mmwaveEnabled: true;
} | null {
  if (!isItabashiSite(siteId)) return null;
  const sec = readHoldSec(
    HOME_ITABASHI_LIVE_SITE_ID_V1,
    MMWAVE_DEFAULT_DWELL_SEC_V1
  );
  return {
    mmwaveDwellSec: sec,
    mmwaveHoldSeconds: sec,
    mmwaveEnabled: true,
  };
}

export function shouldPushMmwaveV1(
  event: "approach" | "dwell",
  nowMs: number,
  previousMs: number | undefined
): boolean {
  if (previousMs == null) return true;
  return nowMs - previousMs >= MMWAVE_PUSH_COOLDOWN_MS_V1;
}

function eventPhase(
  event: string
): MmwavePhaseV1 | "level" | "sample" | null {
  if (event === "approach" || event === "dwell" || event === "clear") {
    return event;
  }
  if (event === "level") return "level";
  if (event === "sample") return "sample";
  return null;
}

function notifyArmed(siteId: string): boolean {
  try {
    const rules = getHomeSecurityRulesV1(siteId);
    return isHomeSecurityArmedV1(rules);
  } catch {
    return true;
  }
}

async function pushMmwaveV1(input: {
  siteId: string;
  phase: "approach" | "dwell";
  message: string;
  force?: boolean;
}): Promise<DeliveryResult | null> {
  const nowMs = Date.now();
  if (!input.force && !notifyArmed(input.siteId)) return null;
  const key = `${input.siteId}:${input.phase}`;
  if (!input.force && !shouldPushMmwaveV1(input.phase, nowMs, lastPushAt.get(key))) {
    return null;
  }
  lastPushAt.set(key, nowMs);
  const maintenance = isMaintenanceActiveV1(input.siteId, nowMs);
  const title =
    input.phase === "dwell" ? "🚨 滞留警報発報中！" : "🟡 接近検知中";
  const eventType =
    input.phase === "dwell"
      ? "home_security_mmwave_dwell"
      : "home_security_mmwave_approach";
  const data = {
    siteId: input.siteId,
    propertyId: "SEC-JP-ITABASHI-LIVE",
    homeSiteId: input.siteId,
    securitySiteId: "SEC-JP-ITABASHI-LIVE",
    customerCode: "TOMS001",
    sensorId: MMWAVE_SENSOR_ID_V1,
  };
  let delivery: DeliveryResult | null = null;
  try {
    delivery = await sendWebPush({
      title,
      body: input.message,
      eventType,
      deviceId: input.siteId,
      url: "/customer/security",
      data,
    });
  } catch (err) {
    console.error("Push Send Error:", err);
  }
  if (maintenance && !input.force) return delivery;
  try {
    insertCustomerNotificationV1({
      customerCode: "TOMS001",
      kind: "alert",
      severity: input.phase === "dwell" ? "danger" : "warning",
      title,
      body: input.message,
      href: "/customer/security",
      dedupeKey: `mmwave-gpio44-${input.phase}`,
    });
  } catch (err) {
    console.error("Push Send Error:", err);
  }
  return delivery;
}

function diagBits(body: {
  level?: unknown;
  gpio?: unknown;
  gpio44?: unknown;
  gpio44Level?: unknown;
  gpio44Error?: unknown;
  pinError?: unknown;
  firmwareVersion?: unknown;
  firmware_version?: unknown;
}): { level: 0 | 1 | null; error: string; firmware: string | null } {
  return {
    level: parseGpioLevel(
      body.gpio44Level ?? body.gpio44 ?? body.level ?? body.gpio
    ),
    error: textOrNull(body.gpio44Error ?? body.pinError) ?? "",
    firmware: textOrNull(body.firmwareVersion ?? body.firmware_version),
  };
}

export async function ingestItabashiMmwaveEventV1(body: {
  siteId?: string;
  deviceId?: string;
  sensor_id?: string;
  sensorId?: string;
  event?: string;
  label?: string;
  level?: unknown;
  gpio?: unknown;
  gpio44?: unknown;
  gpio44Level?: unknown;
  gpio44Error?: unknown;
  pinError?: unknown;
  firmwareVersion?: unknown;
  firmware_version?: unknown;
  heldMs?: unknown;
  force?: boolean;
}): Promise<{
  ok: true;
  phase: MmwavePhaseV1;
  pushed: boolean;
  logged: boolean;
  push: DeliveryResult | null;
}> {
  const sensor = String(body.sensor_id ?? body.sensorId ?? "").trim();
  if (sensor && sensor !== MMWAVE_SENSOR_ID_V1) {
    return { ok: true, phase: "clear", pushed: false, logged: false, push: null };
  }
  const kind = eventPhase(String(body.event ?? "").trim());
  if (!kind) {
    return { ok: true, phase: "clear", pushed: false, logged: false, push: null };
  }
  const siteId = canonicalSite(body.siteId);
  const prev = readLive(siteId);
  const now = new Date().toISOString();
  const diag = diagBits(body);
  if (kind === "sample") {
    ensureTable();
    getDatabase()
      .prepare(
        `INSERT INTO home_mmwave_gpio44_v1
          (site_id, phase, dwell_sec, updated_at, last_event,
           gpio_level, held_ms, pin_error, firmware_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           gpio_level = COALESCE(excluded.gpio_level, gpio_level),
           held_ms = excluded.held_ms,
           pin_error = excluded.pin_error,
           firmware_version = COALESCE(
             excluded.firmware_version, firmware_version
           )`
      )
      .run(
        siteId,
        prev.phase,
        prev.dwellSec,
        now,
        "sample",
        diag.level,
        Math.max(0, Number(body.heldMs) || 0),
        diag.error,
        diag.firmware
      );
    return { ok: true, phase: prev.phase, pushed: false, logged: false, push: null };
  }
  const levelRaw = body.level ?? body.gpio ?? body.gpio44 ?? body.gpio44Level;
  const level =
    kind === "clear" ? 0 : kind === "approach" || kind === "dwell" ? 1 : Number(levelRaw) === 1 ? 1 : Number(levelRaw) === 0 ? 0 : prev.gpioLevel;
  let phase: MmwavePhaseV1 = prev.phase;
  let heldMs = Math.max(0, Number(body.heldMs) || prev.heldMs || 0);
  let highSince = prev.highSince;
  if (kind === "approach") {
    phase = "approach";
    highSince = now;
    heldMs = Math.max(0, Number(body.heldMs) || 0);
  } else if (kind === "dwell") {
    phase = "dwell";
    if (!highSince) highSince = now;
  } else if (kind === "clear" || level === 0) {
    phase = "clear";
    heldMs = 0;
    highSince = null;
  } else if (kind === "level" && level === 1) {
    if (prev.phase !== "dwell") phase = "approach";
    if (!highSince) highSince = now;
  }
  ensureTable();
  getDatabase()
    .prepare(
      `INSERT INTO home_mmwave_gpio44_v1
        (site_id, phase, dwell_sec, updated_at, last_event,
         gpio_level, held_ms, high_since, last_event_at,
         pin_error, firmware_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         phase = excluded.phase,
         updated_at = excluded.updated_at,
         last_event = excluded.last_event,
         gpio_level = excluded.gpio_level,
         held_ms = excluded.held_ms,
         high_since = excluded.high_since,
         last_event_at = excluded.last_event_at,
         pin_error = COALESCE(excluded.pin_error, pin_error),
         firmware_version = COALESCE(
           excluded.firmware_version, firmware_version
         )`
    )
    .run(
      siteId,
      phase,
      prev.dwellSec,
      now,
      kind,
      level,
      heldMs,
      highSince,
      kind === "level" && phase === prev.phase ? prev.lastEventAt : now,
      diag.error,
      diag.firmware
    );

  if (kind === "level" && !(level === 1 && prev.phase === "clear")) {
    return { ok: true, phase, pushed: false, logged: false, push: null };
  }
  if (kind === "clear" || (kind === "level" && level === 0)) {
    clearMmwaveSecurityAlarmV1(siteId);
    recordSystemLogV1({
      siteId,
      category: "sensor_alert",
      message: "板橋自宅：ミリ波レーダーがクリアに戻りました",
      detail: {
        sensorId: MMWAVE_SENSOR_ID_V1,
        label: MMWAVE_LABEL_V1,
        event: "clear",
        deviceId: body.deviceId ?? null,
      },
      actor: "rp2350",
    });
    return { ok: true, phase: "clear", pushed: false, logged: true, push: null };
  }

  const notifyPhase: "approach" | "dwell" =
    kind === "dwell" || phase === "dwell" ? "dwell" : "approach";
  const message =
    notifyPhase === "dwell"
      ? "板橋自宅：窓際・エリア滞留警報（ミリ波レーダー）"
      : "板橋自宅：ミリ波レーダーが接近を検知しました";
  recordSystemLogV1({
    siteId,
    category: "sensor_alert",
    message,
    detail: {
      sensorId: MMWAVE_SENSOR_ID_V1,
      label: MMWAVE_LABEL_V1,
      event: notifyPhase,
      deviceId: body.deviceId ?? null,
      mmwaveHoldSeconds: prev.dwellSec,
    },
    actor: body.force ? "pwa-test" : "rp2350",
  });
  recordMmwaveSecurityAlarmV1({ homeSiteId: siteId, message });
  const push = await pushMmwaveV1({
    siteId,
    phase: notifyPhase,
    message,
    force: Boolean(body.force),
  });
  return {
    ok: true,
    phase: notifyPhase,
    pushed: (push?.sent ?? 0) > 0,
    logged: true,
    push,
  };
}

export function noteItabashiMmwaveDiagV1(body: {
  firmwareVersion?: unknown;
  firmware_version?: unknown;
  firmware?: unknown;
  gpio44?: unknown;
  gpio44Level?: unknown;
  gpio44Error?: unknown;
  pinError?: unknown;
}): void {
  const firmware = textOrNull(
    body.firmwareVersion ?? body.firmware_version ?? body.firmware
  );
  const hasLevel =
    body.gpio44Level !== undefined || body.gpio44 !== undefined;
  const hasError =
    body.gpio44Error !== undefined || body.pinError !== undefined;
  if (!firmware && !hasLevel && !hasError) return;
  const siteId = HOME_ITABASHI_LIVE_SITE_ID_V1;
  const prev = readLive(siteId);
  const level = hasLevel
    ? parseGpioLevel(body.gpio44Level ?? body.gpio44)
    : prev.gpio44Level;
  const error = hasError
    ? textOrNull(body.gpio44Error ?? body.pinError) ?? ""
    : prev.gpio44Error;
  ensureTable();
  getDatabase()
    .prepare(
      `INSERT INTO home_mmwave_gpio44_v1
        (site_id, phase, dwell_sec, updated_at, last_event,
         gpio_level, held_ms, pin_error, firmware_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         gpio_level = COALESCE(excluded.gpio_level, gpio_level),
         pin_error = COALESCE(excluded.pin_error, pin_error),
         firmware_version = COALESCE(
           excluded.firmware_version, firmware_version
         )`
    )
    .run(
      siteId,
      prev.phase,
      prev.dwellSec,
      prev.updatedAt,
      null,
      level,
      prev.heldMs,
      error,
      firmware
    );
}

export function countItabashiMmwaveOpenAlarmsV1(): number {
  return listSecurityAlarmLogsV1("SEC-JP-ITABASHI-LIVE").filter(
    (log) => log.status !== "done"
  ).length;
}

export async function sendItabashiMmwaveTestPushV1(
  siteId?: string
): Promise<{
  ok: true;
  phase: MmwavePhaseV1;
  pushed: boolean;
  sent: number;
  attempted: number;
  statusCodes: Array<number | null>;
  openAlarmCount: number;
}> {
  const result = await ingestItabashiMmwaveEventV1({
    siteId,
    sensor_id: MMWAVE_SENSOR_ID_V1,
    event: "dwell",
    label: MMWAVE_LABEL_V1,
    force: true,
    deviceId: "pwa-test",
  });
  const attempts = result.push?.attempts ?? [];
  return {
    ok: true,
    phase: result.phase,
    pushed: result.pushed,
    sent: result.push?.sent ?? 0,
    attempted: result.push?.attempted ?? attempts.length,
    statusCodes: attempts.map((row) => row.statusCode ?? null),
    openAlarmCount: countItabashiMmwaveOpenAlarmsV1(),
  };
}

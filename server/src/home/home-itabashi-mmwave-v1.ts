/**
 * 板橋自宅 GPIO44 のミリ波レーダー。
 * DI/DO の保存設定は読みも書きもしない。
 */

import { getDatabase } from "../db/database.js";
import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "./home-sites-v1.js";
import { isMaintenanceActiveV1 } from "./home-ops-safety-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import { sendWebPush } from "../notification/channels/web-push.js";

export const MMWAVE_SENSOR_ID_V1 = "mmwave_gpio44";
export const MMWAVE_LABEL_V1 = "ミリ波レーダー（GPIO44）";
export const MMWAVE_DEFAULT_DWELL_SEC_V1 = 5;
export const MMWAVE_APPROACH_COOLDOWN_MS_V1 = 45_000;
export const MMWAVE_DWELL_COOLDOWN_MS_V1 = 60_000;

export type MmwavePhaseV1 = "clear" | "approach" | "dwell";

export interface MmwaveStatusV1 {
  ok: true;
  siteId: string;
  sensorId: typeof MMWAVE_SENSOR_ID_V1;
  label: string;
  rangeLabel: string;
  phase: MmwavePhaseV1;
  phaseLabel: string;
  dwellSec: number;
  updatedAt: string | null;
}

const lastPushAt = new Map<string, number>();
let tableReady = false;

function ensureTable(): void {
  if (tableReady) return;
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS home_mmwave_gpio44_v1 (
      site_id TEXT PRIMARY KEY,
      phase TEXT NOT NULL,
      dwell_sec INTEGER NOT NULL,
      updated_at TEXT,
      last_event TEXT
    )
  `);
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

export function mmwavePhaseLabelV1(phase: MmwavePhaseV1): string {
  if (phase === "dwell") return "🚨 滞留検知中";
  if (phase === "approach") return "🟡 接近検知";
  return "🟢 クリア（待機中）";
}

function isItabashiSite(siteId: string): boolean {
  const id = siteId.trim();
  return (
    id === HOME_ITABASHI_LIVE_SITE_ID_V1 ||
    id === "SEC-JP-ITABASHI-LIVE" ||
    id === "TOMS001"
  );
}

function canonicalSite(siteId: string | undefined): string {
  const id = String(siteId ?? "").trim();
  if (!id || isItabashiSite(id)) return HOME_ITABASHI_LIVE_SITE_ID_V1;
  return id;
}

function readRow(siteId: string): {
  phase: MmwavePhaseV1;
  dwellSec: number;
  updatedAt: string | null;
} {
  ensureTable();
  const row = getDatabase()
    .prepare(
      `SELECT phase, dwell_sec, updated_at
       FROM home_mmwave_gpio44_v1 WHERE site_id = ?`
    )
    .get(siteId) as
    | { phase?: string; dwell_sec?: number; updated_at?: string }
    | undefined;
  const phase = row?.phase;
  const safe: MmwavePhaseV1 =
    phase === "approach" || phase === "dwell" || phase === "clear"
      ? phase
      : "clear";
  return {
    phase: safe,
    dwellSec: clampMmwaveDwellSecV1(
      row?.dwell_sec ?? MMWAVE_DEFAULT_DWELL_SEC_V1
    ),
    updatedAt: row?.updated_at ?? null,
  };
}

export function getItabashiMmwaveStatusV1(
  siteId?: string
): MmwaveStatusV1 {
  const id = canonicalSite(siteId);
  const row = readRow(id);
  return {
    ok: true,
    siteId: id,
    sensorId: MMWAVE_SENSOR_ID_V1,
    label: MMWAVE_LABEL_V1,
    rangeLabel: "2.25m設定",
    phase: row.phase,
    phaseLabel: mmwavePhaseLabelV1(row.phase),
    dwellSec: row.dwellSec,
    updatedAt: row.updatedAt,
  };
}

export function saveItabashiMmwaveDwellSecV1(
  dwellSec: unknown,
  siteId?: string
): MmwaveStatusV1 {
  const id = canonicalSite(siteId);
  const prev = readRow(id);
  const sec = clampMmwaveDwellSecV1(dwellSec);
  ensureTable();
  getDatabase()
    .prepare(
      `INSERT INTO home_mmwave_gpio44_v1
        (site_id, phase, dwell_sec, updated_at, last_event)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         dwell_sec = excluded.dwell_sec`
    )
    .run(id, prev.phase, sec, prev.updatedAt, null);
  return getItabashiMmwaveStatusV1(id);
}

export function itabashiMmwaveFirmwareExtraV1(
  siteId: string
): { mmwaveDwellSec: number; mmwaveEnabled: true } | null {
  if (!isItabashiSite(siteId) && siteId !== HOME_ITABASHI_LIVE_SITE_ID_V1) {
    return null;
  }
  if (
    siteId !== HOME_ITABASHI_LIVE_SITE_ID_V1 &&
    siteId !== "SEC-JP-ITABASHI-LIVE" &&
    !isItabashiSite(siteId)
  ) {
    return null;
  }
  const row = readRow(HOME_ITABASHI_LIVE_SITE_ID_V1);
  return { mmwaveDwellSec: row.dwellSec, mmwaveEnabled: true };
}

export function shouldPushMmwaveV1(
  event: "approach" | "dwell",
  nowMs: number,
  previousMs: number | undefined
): boolean {
  const wait =
    event === "dwell"
      ? MMWAVE_DWELL_COOLDOWN_MS_V1
      : MMWAVE_APPROACH_COOLDOWN_MS_V1;
  if (previousMs == null) return true;
  return nowMs - previousMs >= wait;
}

function eventPhase(event: string): MmwavePhaseV1 | null {
  if (event === "approach" || event === "dwell" || event === "clear") {
    return event;
  }
  return null;
}

export async function ingestItabashiMmwaveEventV1(body: {
  siteId?: string;
  deviceId?: string;
  sensor_id?: string;
  sensorId?: string;
  event?: string;
  label?: string;
}): Promise<{ ok: true; phase: MmwavePhaseV1; pushed: boolean; logged: boolean }> {
  const sensor = String(body.sensor_id ?? body.sensorId ?? "").trim();
  if (sensor && sensor !== MMWAVE_SENSOR_ID_V1) {
    return { ok: true, phase: "clear", pushed: false, logged: false };
  }
  const phase = eventPhase(String(body.event ?? "").trim());
  if (!phase) {
    return { ok: true, phase: "clear", pushed: false, logged: false };
  }
  const siteId = canonicalSite(body.siteId);
  const prev = readRow(siteId);
  const now = new Date().toISOString();
  ensureTable();
  getDatabase()
    .prepare(
      `INSERT INTO home_mmwave_gpio44_v1
        (site_id, phase, dwell_sec, updated_at, last_event)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         phase = excluded.phase,
         updated_at = excluded.updated_at,
         last_event = excluded.last_event`
    )
    .run(siteId, phase, prev.dwellSec, now, phase);

  const message =
    phase === "dwell"
      ? "板橋自宅：窓際・エリア滞留警報（ミリ波レーダー）"
      : phase === "approach"
        ? "板橋自宅：ミリ波レーダーが接近を検知しました"
        : "板橋自宅：ミリ波レーダーがクリアに戻りました";
  recordSystemLogV1({
    siteId,
    category: "sensor_alert",
    message,
    detail: {
      sensorId: MMWAVE_SENSOR_ID_V1,
      label: MMWAVE_LABEL_V1,
      event: phase,
      deviceId: body.deviceId ?? null,
    },
    actor: "rp2350",
  });

  if (phase === "clear" || phase === prev.phase) {
    return { ok: true, phase, pushed: false, logged: true };
  }
  const nowMs = Date.now();
  const key = `${siteId}:${phase}`;
  if (!shouldPushMmwaveV1(phase, nowMs, lastPushAt.get(key))) {
    return { ok: true, phase, pushed: false, logged: true };
  }
  lastPushAt.set(key, nowMs);
  const maintenance = isMaintenanceActiveV1(siteId, nowMs);
  const title = phase === "dwell" ? "🚨 滞留検知" : "🟡 接近検知";
  try {
    await sendWebPush({
      title,
      body: message,
      eventType: phase === "dwell" ? "mmwave_dwell" : "mmwave_approach",
      deviceId: siteId,
      url: "/app/security",
      audience: "toms",
    });
    if (!maintenance) {
      await sendWebPush({
        title,
        body: message,
        eventType: phase === "dwell" ? "mmwave_dwell" : "mmwave_approach",
        deviceId: siteId,
      url: "/customer/security",
      audience: "customer",
    });
    }
  } catch (err) {
    console.error("Push Send Error:", err);
  }
  return { ok: true, phase, pushed: true, logged: true };
}

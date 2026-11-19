/**
 * 稼働時間とリセット理由。
 * 欠損の心拍でも例外にしない。
 * お客様画面へは出さない。
 */

import fs from "fs";
import path from "path";
import {
  canonicalOpsSiteKeyV1,
  opsSiteDisplayNameV1,
} from "./home-ops-safety-v1.js";

export const DEVICE_HEALTH_WDT_WINDOW_MS_V1 = 24 * 60 * 60 * 1000;
export const DEVICE_HEALTH_WDT_COUNT_V1 = 3;
export const DEVICE_HEALTH_ALERT_COOLDOWN_MS_V1 = 6 * 60 * 60 * 1000;
export const DEVICE_HEALTH_SHORT_BOOT_SEC_V1 = 180;

const REASONS = new Set([
  "PWRON",
  "WDT",
  "SOFT",
  "HARD",
  "OTA",
  "DEEPSLEEP",
  "UNKNOWN",
]);

const REASON_LABEL: Record<string, string> = {
  PWRON: "通常電源投入",
  WDT: "WDT自動復旧",
  SOFT: "ソフトリセット",
  HARD: "ハードリセット",
  OTA: "OTA更新",
  DEEPSLEEP: "ディープスリープ",
  UNKNOWN: "不明",
};

interface HealthEventV1 {
  at: number;
  kind: "wdt" | "short";
}

interface HealthSlotV1 {
  bootKey: number | null;
  uptimeSec: number | null;
  maxUptimeSec: number | null;
  resetReason: string | null;
  events: HealthEventV1[];
  lastAlertMs: number;
  history: Array<{
    at: string;
    uptimeSec: number | null;
    resetReason: string | null;
  }>;
  seenCuts: string[];
}

interface HealthStateV1 {
  slots: Record<string, HealthSlotV1>;
}

export interface DeviceHealthViewV1 {
  uptimeSec: number | null;
  uptimeLabel: string;
  resetReason: string | null;
  resetLabel: string;
  wdtFrequent: boolean;
  badge: string | null;
}

let memoryMode = false;
let memoryState: HealthStateV1 | null = null;

function emptySlot(): HealthSlotV1 {
  return {
    bootKey: null,
    uptimeSec: null,
    maxUptimeSec: null,
    resetReason: null,
    events: [],
    lastAlertMs: 0,
    history: [],
    seenCuts: [],
  };
}

function emptyState(): HealthStateV1 {
  return { slots: {} };
}

function storePath(): string {
  return path.join(process.cwd(), "data", "home-device-health-v1.json");
}

function loadState(): HealthStateV1 {
  if (memoryMode && memoryState) return memoryState;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(storePath(), "utf8")
    ) as Partial<HealthStateV1>;
    const state = emptyState();
    state.slots = parsed.slots ?? {};
    return state;
  } catch {
    return emptyState();
  }
}

function saveState(state: HealthStateV1): void {
  if (memoryMode) {
    memoryState = state;
    return;
  }
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), "utf8");
  fs.renameSync(tmp, file);
}

export function resetDeviceHealthForTestV1(): void {
  memoryMode = true;
  memoryState = emptyState();
}

export function parseUptimeSecV1(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function parseResetReasonV1(raw: unknown): string | null {
  const text = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!text) return null;
  if (REASONS.has(text)) return text;
  const clean = text.replace(/[^A-Z0-9_]/g, "").slice(0, 16);
  return clean || null;
}

export function formatUptimeLabelV1(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const total = Math.floor(sec);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}日 ${hours}時間${mins}分`;
  if (hours > 0) return `${hours}時間${mins}分`;
  return `${mins}分`;
}

export function resetReasonLabelV1(reason: string | null): string {
  if (!reason) return "未取得";
  return REASON_LABEL[reason] ?? reason;
}

function slotOf(state: HealthStateV1, key: string): HealthSlotV1 {
  if (!state.slots[key]) state.slots[key] = emptySlot();
  return state.slots[key];
}

function prune(slot: HealthSlotV1, nowMs: number): void {
  const from = nowMs - DEVICE_HEALTH_WDT_WINDOW_MS_V1;
  slot.events = slot.events.filter((row) => row.at >= from);
  if (slot.history.length > 120) {
    slot.history = slot.history.slice(-120);
  }
  if (slot.seenCuts.length > 40) {
    slot.seenCuts = slot.seenCuts.slice(-40);
  }
}

function countKind(slot: HealthSlotV1, kind: "wdt" | "short"): number {
  return slot.events.filter((row) => row.kind === kind).length;
}

export function deviceHealthViewV1(
  siteId: string,
  nowMs: number = Date.now()
): DeviceHealthViewV1 {
  const state = loadState();
  const slot = state.slots[canonicalOpsSiteKeyV1(siteId)];
  const uptimeSec = slot?.uptimeSec ?? null;
  const reason = slot?.resetReason ?? null;
  const frequent =
    !!slot &&
    (countKind(slot, "wdt") >= DEVICE_HEALTH_WDT_COUNT_V1 ||
      countKind(slot, "short") >= DEVICE_HEALTH_WDT_COUNT_V1);
  return {
    uptimeSec,
    uptimeLabel: formatUptimeLabelV1(uptimeSec),
    resetReason: reason,
    resetLabel: resetReasonLabelV1(reason),
    wdtFrequent: frequent,
    badge: frequent ? "⚠️ 再起動頻発" : null,
  };
}

function parseCuts(raw: unknown): Array<{
  ch: number;
  limitSec: number | null;
  atMs: number;
}> {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const ch = Number(rec.ch);
    if (!Number.isFinite(ch)) continue;
    const limit = Number(rec.limit_sec);
    const at = Number(rec.at_ms);
    rows.push({
      ch: Math.floor(ch),
      limitSec: Number.isFinite(limit) ? limit : null,
      atMs: Number.isFinite(at) ? Math.floor(at) : 0,
    });
  }
  return rows;
}

export function noteDeviceHealthV1(input: {
  siteId: string;
  uptimeSec?: unknown;
  resetReason?: unknown;
  doLimitCuts?: unknown;
  nowMs?: number;
}): {
  stored: boolean;
  staffAlert: string | null;
  newCuts: Array<{ ch: number; limitSec: number | null }>;
} {
  const uptime = parseUptimeSecV1(input.uptimeSec);
  const reason = parseResetReasonV1(input.resetReason);
  const cuts = parseCuts(input.doLimitCuts);
  if (uptime == null && !reason && cuts.length === 0) {
    return { stored: false, staffAlert: null, newCuts: [] };
  }
  const nowMs = input.nowMs ?? Date.now();
  const state = loadState();
  const key = canonicalOpsSiteKeyV1(input.siteId);
  const slot = slotOf(state, key);
  const name = opsSiteDisplayNameV1(input.siteId);
  let restarted = false;
  if (uptime != null) {
    const bootMs = nowMs - uptime * 1000;
    const bootKey = Math.round(bootMs / 8000);
    restarted =
      slot.bootKey == null ||
      slot.bootKey !== bootKey ||
      (slot.uptimeSec != null && uptime + 5 < slot.uptimeSec);
    if (restarted && slot.bootKey != null) {
      if (reason === "WDT") {
        slot.events.push({ at: nowMs, kind: "wdt" });
      } else if (
        slot.maxUptimeSec != null &&
        slot.maxUptimeSec < DEVICE_HEALTH_SHORT_BOOT_SEC_V1
      ) {
        slot.events.push({ at: nowMs, kind: "short" });
      }
    } else if (restarted && reason === "WDT") {
      slot.events.push({ at: nowMs, kind: "wdt" });
    }
    slot.bootKey = bootKey;
    slot.uptimeSec = uptime;
    slot.maxUptimeSec = restarted
      ? uptime
      : Math.max(slot.maxUptimeSec ?? 0, uptime);
  }
  if (reason) slot.resetReason = reason;
  slot.history.push({
    at: new Date(nowMs).toISOString(),
    uptimeSec: slot.uptimeSec,
    resetReason: slot.resetReason,
  });
  const newCuts = [];
  for (const cut of cuts) {
    const mark = `${slot.bootKey ?? 0}:${cut.ch}:${cut.atMs}`;
    if (slot.seenCuts.includes(mark)) continue;
    slot.seenCuts.push(mark);
    newCuts.push({ ch: cut.ch, limitSec: cut.limitSec });
  }
  prune(slot, nowMs);
  let staffAlert: string | null = null;
  const wdtCount = countKind(slot, "wdt");
  const shortCount = countKind(slot, "short");
  const cooled =
    nowMs - slot.lastAlertMs >= DEVICE_HEALTH_ALERT_COOLDOWN_MS_V1;
  if (cooled && wdtCount >= DEVICE_HEALTH_WDT_COUNT_V1) {
    staffAlert =
      `⚠️ 【不安定・再起動頻発】${name}：` +
      "24時間以内にWDTリセットが3回以上発生しています" +
      "（電源ノイズ・通信詰まりの疑い）";
    slot.lastAlertMs = nowMs;
  } else if (cooled && shortCount >= DEVICE_HEALTH_WDT_COUNT_V1) {
    staffAlert =
      `⚠️ 【不安定・再起動頻発】${name}：` +
      "24時間以内に起動直後の再起動が3回以上発生しています" +
      "（電源ノイズ・通信詰まりの疑い）";
    slot.lastAlertMs = nowMs;
  }
  saveState(state);
  return { stored: true, staffAlert, newCuts };
}

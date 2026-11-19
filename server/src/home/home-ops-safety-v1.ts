/**
 * 全物件共通の保守セーフティ。
 * 点検の自動復帰、センサー連打、盤内温度。
 * 実機ファームと保存済み設定は書き換えない。
 */

import fs from "fs";
import path from "path";

export const OPS_SAFETY_PRESET_MINUTES_V1 = [30, 120, 240] as const;
export const OPS_DI_PUSH_COOLDOWN_MS_V1 = 45_000;
export const OPS_DI_FLOOD_WINDOW_MS_V1 = 10 * 60 * 1000;
export const OPS_DI_FLOOD_COUNT_V1 = 10;
export const OPS_CABINET_CAUTION_C_V1 = 55;
export const OPS_CABINET_DANGER_C_V1 = 65;
export const OPS_CABINET_PUSH_COOLDOWN_MS_V1 = 60 * 60 * 1000;

type SiteGroupV1 = { key: string; name: string; ids: string[] };

const SITE_GROUPS_V1: SiteGroupV1[] = [
  {
    key: "HOME-JP-ITABASHI-LIVE",
    name: "板橋自宅",
    ids: [
      "HOME-JP-ITABASHI-LIVE",
      "SEC-JP-ITABASHI-LIVE",
      "TOMS001",
      "HOME001",
    ],
  },
  {
    key: "HOME-JP-TOYOSHIMA",
    name: "豊島邸",
    ids: [
      "HOME-JP-TOYOSHIMA",
      "SEC-JP-TOYOSHIMA-001",
      "TOYOSHIMA001",
      "HOME-JP-TOSHIMA",
    ],
  },
  {
    key: "HOME-JP-RYUGASAKI",
    name: "ウォッシュメイト龍ヶ崎店",
    ids: [
      "HOME-JP-RYUGASAKI",
      "SEC-JP-RYUGASAKI-001",
      "WASHMATE001",
    ],
  },
  {
    key: "HOME-JP-KEEPRISING",
    name: "Keep Rising",
    ids: [
      "HOME-JP-KEEPRISING",
      "SEC-JP-KEEPRISING-001",
      "KEEPRISING001",
    ],
  },
];

interface CabinetSlotV1 {
  tempC: number | null;
  cautionLogged: boolean;
  lastDangerPushMs: number;
}

interface SafetyStateV1 {
  until: Record<string, string>;
  hits: Record<string, number[]>;
  lastPush: Record<string, number>;
  floodMark: Record<string, number>;
  cabinet: Record<string, CabinetSlotV1>;
  holds: Record<string, string>;
}

export interface MaintenanceViewV1 {
  active: boolean;
  until: string | null;
  remainingMin: number;
  resumeLabel: string;
  banner: string;
}

export interface SensorGateV1 {
  allowCustomerPush: boolean;
  reason: "allow" | "cooldown" | "flood" | "maintenance";
  logPrefix: string;
  logMessage: string;
  staffAlert: { title: string; body: string } | null;
}

export interface CabinetNoteV1 {
  level: "none" | "normal" | "caution" | "danger";
  badge: string;
  badgeTone: "none" | "caution" | "danger";
  tempC: number | null;
  logMessage: string | null;
  staffPush: { title: string; body: string } | null;
}

let memoryMode = false;
let memoryState: SafetyStateV1 | null = null;

function emptyState(): SafetyStateV1 {
  return {
    until: {},
    hits: {},
    lastPush: {},
    floodMark: {},
    cabinet: {},
    holds: {},
  };
}

function storePath(): string {
  return path.join(process.cwd(), "data", "home-ops-safety-v1.json");
}

function loadState(): SafetyStateV1 {
  if (memoryMode && memoryState) return memoryState;
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SafetyStateV1>;
    const state = emptyState();
    state.until = parsed.until ?? {};
    state.hits = parsed.hits ?? {};
    state.lastPush = parsed.lastPush ?? {};
    state.floodMark = parsed.floodMark ?? {};
    state.cabinet = parsed.cabinet ?? {};
    state.holds = parsed.holds ?? {};
    return state;
  } catch {
    return emptyState();
  }
}

function saveState(state: SafetyStateV1): void {
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

/** テストはディスクの現場データを触らない。 */
export function useOpsSafetyMemoryForTestV1(): void {
  memoryMode = true;
  memoryState = emptyState();
}

export function resetOpsSafetyForTestV1(): void {
  memoryMode = true;
  memoryState = emptyState();
}

export function canonicalOpsSiteKeyV1(siteId: string): string {
  const raw = String(siteId || "").trim();
  const upper = raw.toUpperCase();
  for (const group of SITE_GROUPS_V1) {
    if (group.ids.some((id) => id.toUpperCase() === upper)) {
      return group.key;
    }
  }
  return raw;
}

export function opsSiteDisplayNameV1(siteId: string): string {
  const key = canonicalOpsSiteKeyV1(siteId);
  const group = SITE_GROUPS_V1.find((row) => row.key === key);
  if (group) return group.name;
  return key || "現場";
}

function formatJstHmV1(ms: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}

export function isMaintenanceActiveV1(
  siteId: string,
  nowMs: number = Date.now()
): boolean {
  const state = loadState();
  const until = state.until[canonicalOpsSiteKeyV1(siteId)];
  if (!until) return false;
  const at = Date.parse(until);
  return Number.isFinite(at) && at > nowMs;
}

export function maintenanceBlocksAutoRebootV1(
  siteId: string,
  nowMs: number = Date.now()
): boolean {
  return isMaintenanceActiveV1(siteId, nowMs);
}

export function maintenanceViewV1(
  siteId: string,
  nowMs: number = Date.now()
): MaintenanceViewV1 {
  const state = loadState();
  const key = canonicalOpsSiteKeyV1(siteId);
  const until = state.until[key] || null;
  const at = until ? Date.parse(until) : NaN;
  if (!until || !Number.isFinite(at) || at <= nowMs) {
    if (until) {
      delete state.until[key];
      saveState(state);
    }
    return {
      active: false,
      until: null,
      remainingMin: 0,
      resumeLabel: "",
      banner: "",
    };
  }
  const remainingMin = Math.max(1, Math.ceil((at - nowMs) / 60000));
  const resumeLabel = formatJstHmV1(at);
  return {
    active: true,
    until,
    remainingMin,
    resumeLabel,
    banner: `🛠️ 点検中（残り${remainingMin}分・自動復帰予定 ${resumeLabel}）`,
  };
}

export function startMaintenanceV1(
  siteId: string,
  minutes: number,
  nowMs: number = Date.now()
): MaintenanceViewV1 {
  const allowed = OPS_SAFETY_PRESET_MINUTES_V1.includes(
    minutes as (typeof OPS_SAFETY_PRESET_MINUTES_V1)[number]
  );
  if (!allowed) {
    throw new Error("minutes must be 30, 120 or 240");
  }
  const state = loadState();
  const key = canonicalOpsSiteKeyV1(siteId);
  state.until[key] = new Date(nowMs + minutes * 60_000).toISOString();
  saveState(state);
  return maintenanceViewV1(siteId, nowMs);
}

export function clearMaintenanceV1(
  siteId: string,
  nowMs: number = Date.now()
): MaintenanceViewV1 {
  const state = loadState();
  delete state.until[canonicalOpsSiteKeyV1(siteId)];
  saveState(state);
  return maintenanceViewV1(siteId, nowMs);
}

function sensorKey(siteId: string, di: number): string {
  return `${canonicalOpsSiteKeyV1(siteId)}:DI${di}`;
}

export function observeSensorHitV1(input: {
  siteId: string;
  di: number;
  siteName?: string;
  nowMs?: number;
}): SensorGateV1 {
  const nowMs = input.nowMs ?? Date.now();
  const di = Number(input.di);
  const name = input.siteName || opsSiteDisplayNameV1(input.siteId);
  const state = loadState();
  const key = sensorKey(input.siteId, di);
  const prev = state.hits[key] ?? [];
  const fresh = prev.filter((at) => nowMs - at < OPS_DI_FLOOD_WINDOW_MS_V1);
  fresh.push(nowMs);
  state.hits[key] = fresh;
  const flood = fresh.length >= OPS_DI_FLOOD_COUNT_V1;
  let staffAlert: SensorGateV1["staffAlert"] = null;
  if (flood) {
    if (!state.floodMark[key]) {
      state.floodMark[key] = nowMs;
      const title =
        `⚠️ 【センサー異常疑い】${name}：DI${di}が` +
        "10分間で10回以上連続発報しています" +
        "（誤作動・断線・草木干渉の疑い）";
      staffAlert = { title, body: title };
    }
    saveState(state);
    return {
      allowCustomerPush: false,
      reason: "flood",
      logPrefix: "",
      logMessage: staffAlert?.title || `DI${di} 連続発報を抑制`,
      staffAlert,
    };
  }
  delete state.floodMark[key];
  if (isMaintenanceActiveV1(input.siteId, nowMs)) {
    saveState(state);
    const message = `[点検中] ${name} DI${di} 検知。施主通知は保留`;
    return {
      allowCustomerPush: false,
      reason: "maintenance",
      logPrefix: "[点検中] ",
      logMessage: message,
      staffAlert: null,
    };
  }
  const last = state.lastPush[key] ?? 0;
  if (last && nowMs - last < OPS_DI_PUSH_COOLDOWN_MS_V1) {
    saveState(state);
    return {
      allowCustomerPush: false,
      reason: "cooldown",
      logPrefix: "",
      logMessage: `DI${di} は45秒以内のため履歴のみ`,
      staffAlert: null,
    };
  }
  saveState(state);
  return {
    allowCustomerPush: true,
    reason: "allow",
    logPrefix: "",
    logMessage: "",
    staffAlert: null,
  };
}

export function markSensorCustomerPushV1(
  siteId: string,
  di: number,
  nowMs: number = Date.now()
): void {
  const state = loadState();
  state.lastPush[sensorKey(siteId, di)] = nowMs;
  saveState(state);
}

export function noteCabinetTempV1(input: {
  siteId: string;
  tempC: number | null;
  siteName?: string;
  nowMs?: number;
}): CabinetNoteV1 {
  const nowMs = input.nowMs ?? Date.now();
  const name = input.siteName || opsSiteDisplayNameV1(input.siteId);
  const tempC =
    input.tempC == null || !Number.isFinite(Number(input.tempC))
      ? null
      : Math.round(Number(input.tempC) * 10) / 10;
  const state = loadState();
  const key = canonicalOpsSiteKeyV1(input.siteId);
  const slot = state.cabinet[key] ?? {
    tempC: null,
    cautionLogged: false,
    lastDangerPushMs: 0,
  };
  if (tempC == null) {
    state.cabinet[key] = { ...slot, tempC: null };
    saveState(state);
    return {
      level: "none",
      badge: "",
      badgeTone: "none",
      tempC: null,
      logMessage: null,
      staffPush: null,
    };
  }
  slot.tempC = tempC;
  if (tempC < OPS_CABINET_CAUTION_C_V1) {
    slot.cautionLogged = false;
    state.cabinet[key] = slot;
    saveState(state);
    return {
      level: "normal",
      badge: "",
      badgeTone: "none",
      tempC,
      logMessage: null,
      staffPush: null,
    };
  }
  if (tempC < OPS_CABINET_DANGER_C_V1) {
    const logMessage = slot.cautionLogged
      ? null
      : `⚠️ 高温注意 ${name} 盤内 ${tempC.toFixed(1)}℃`;
    slot.cautionLogged = true;
    state.cabinet[key] = slot;
    saveState(state);
    return {
      level: "caution",
      badge: "⚠️ 高温注意",
      badgeTone: "caution",
      tempC,
      logMessage,
      staffPush: null,
    };
  }
  slot.cautionLogged = true;
  let staffPush: CabinetNoteV1["staffPush"] = null;
  const cooled =
    nowMs - slot.lastDangerPushMs >= OPS_CABINET_PUSH_COOLDOWN_MS_V1;
  if (cooled) {
    slot.lastDangerPushMs = nowMs;
    const title =
      `🔥 【盤内高温警報】${name}：盤内温度が ` +
      `${tempC.toFixed(1)}℃ に達しています` +
      "（熱暴走・機器劣化の恐れ）";
    staffPush = { title, body: title };
  }
  state.cabinet[key] = slot;
  saveState(state);
  return {
    level: "danger",
    badge: "🔥 高温警報",
    badgeTone: "danger",
    tempC,
    logMessage: staffPush?.title ?? null,
    staffPush,
  };
}

export function cabinetViewV1(siteId: string): CabinetNoteV1 {
  const state = loadState();
  const slot = state.cabinet[canonicalOpsSiteKeyV1(siteId)];
  if (!slot || slot.tempC == null) {
    return {
      level: "none",
      badge: "",
      badgeTone: "none",
      tempC: null,
      logMessage: null,
      staffPush: null,
    };
  }
  if (slot.tempC >= OPS_CABINET_DANGER_C_V1) {
    return {
      level: "danger",
      badge: "🔥 高温警報",
      badgeTone: "danger",
      tempC: slot.tempC,
      logMessage: null,
      staffPush: null,
    };
  }
  if (slot.tempC >= OPS_CABINET_CAUTION_C_V1) {
    return {
      level: "caution",
      badge: "⚠️ 高温注意",
      badgeTone: "caution",
      tempC: slot.tempC,
      logMessage: null,
      staffPush: null,
    };
  }
  return {
    level: "normal",
    badge: "",
    badgeTone: "none",
    tempC: slot.tempC,
    logMessage: null,
    staffPush: null,
  };
}

/** 点検中の途絶ログを、同じ期限では一度だけ出す。 */
export function takeMaintenanceHoldLogV1(
  siteId: string,
  scope: string,
  nowMs: number = Date.now()
): boolean {
  const view = maintenanceViewV1(siteId, nowMs);
  const state = loadState();
  const key = `${canonicalOpsSiteKeyV1(siteId)}:${scope}`;
  if (!view.active || !view.until) {
    delete state.holds[key];
    saveState(state);
    return false;
  }
  if (state.holds[key] === view.until) return false;
  state.holds[key] = view.until;
  saveState(state);
  return true;
}

/**
 * 社内端末の通知だけを物件で分ける。
 * 施主の購読と点検の保存は触らない。
 * 板橋自宅は通常も保守も常時受信。
 * 他現場の通常は点検か作業タイマーだけ。
 */

import fs from "fs";
import path from "path";
import {
  canonicalOpsSiteKeyV1,
  isMaintenanceActiveV1,
  opsSiteDisplayNameV1,
} from "../home/home-ops-safety-v1.js";

export const STAFF_NOTIFY_PRESET_MINUTES_V1 = [30, 120, 240] as const;

const ITABASHI_KEY = "HOME-JP-ITABASHI-LIVE";

export type StaffEventClassV1 =
  | "normal"
  | "critical_maintenance"
  | "passthrough";

export type StaffTitleKindV1 = "staff" | "staff_work" | "keep";

interface NotifySlotV1 {
  normalAlways: boolean | null;
  criticalEnabled: boolean | null;
  tempNotifyUntil: string | null;
}

interface NotifyStateV1 {
  slots: Record<string, NotifySlotV1>;
}

export interface StaffNotifyDecisionV1 {
  eventClass: StaffEventClassV1;
  deliver: boolean;
  titleKind: StaffTitleKindV1;
  title: string;
}

export interface StaffNotifyViewV1 {
  itabashi: boolean;
  statusLabel: string;
  statusTone: "on" | "work" | "off";
  hint: string;
  showWorkTimer: boolean;
  tempNotifyUntil: string | null;
  tempActive: boolean;
  maintenanceActive: boolean;
  criticalEnabled: boolean;
  alwaysLabel: string;
  alwaysChecked: boolean;
}

let memoryMode = false;
let memoryState: NotifyStateV1 | null = null;

function emptySlot(): NotifySlotV1 {
  return {
    normalAlways: null,
    criticalEnabled: null,
    tempNotifyUntil: null,
  };
}

function emptyState(): NotifyStateV1 {
  return { slots: {} };
}

function storePath(): string {
  return path.join(process.cwd(), "data", "staff-notify-policy-v1.json");
}

function loadState(): NotifyStateV1 {
  if (memoryMode && memoryState) return memoryState;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(storePath(), "utf8")
    ) as Partial<NotifyStateV1>;
    return { slots: parsed.slots ?? {} };
  } catch {
    return emptyState();
  }
}

function saveState(state: NotifyStateV1): void {
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

function slotOf(state: NotifyStateV1, key: string): NotifySlotV1 {
  if (!state.slots[key]) state.slots[key] = emptySlot();
  return state.slots[key];
}

export function resetStaffNotifyPolicyForTestV1(): void {
  memoryMode = true;
  memoryState = emptyState();
}

export function isItabashiNotifySiteV1(siteId: string): boolean {
  return canonicalOpsSiteKeyV1(siteId) === ITABASHI_KEY;
}

export function classifyStaffEventClassV1(
  eventType: string
): StaffEventClassV1 {
  const name = String(eventType || "").toLowerCase();
  if (!name) return "passthrough";
  if (
    name.includes("heartbeat_lost") ||
    name.includes("comm_loss") ||
    name.includes("board_overheat") ||
    name.includes("board_temp") ||
    name.includes("ops_cabinet_danger") ||
    name.includes("ops_wdt_frequent") ||
    name.includes("ops_sensor_flood")
  ) {
    return "critical_maintenance";
  }
  if (
    name.includes("home_security_") ||
    name.includes("sensor") ||
    name.includes("beam_") ||
    name.includes("toyoshima_main_") ||
    name.includes("toyoshima_detached_") ||
    name.includes("test_notify") ||
    name.includes("day_test") ||
    name.includes("remote_test") ||
    name.includes("push_test") ||
    name === "test" ||
    name.includes("ch_state") ||
    name.includes("input_state") ||
    name.includes("light") ||
    name.includes("relay")
  ) {
    return "normal";
  }
  return "passthrough";
}

function tempActive(slot: NotifySlotV1, nowMs: number): boolean {
  if (!slot.tempNotifyUntil) return false;
  const at = Date.parse(slot.tempNotifyUntil);
  return Number.isFinite(at) && at > nowMs;
}

export function formatStaffNotifyTitleV1(
  title: string,
  siteName: string,
  kind: StaffTitleKindV1
): string {
  if (kind === "keep") return title;
  const prefix = kind === "staff_work" ? "[社内・点検]" : "[社内]";
  const bare = String(title || "")
    .replace(/^\[社内・点検\]\s*/, "")
    .replace(/^\[社内\]\s*/, "")
    .trim();
  const name = siteName || "現場";
  if (bare.startsWith(`${name}：`) || bare.startsWith(`${name}:`)) {
    return `${prefix} ${bare}`;
  }
  return `${prefix} ${name}：${bare}`;
}

export function decideStaffNotifyV1(input: {
  siteId: string;
  eventType: string;
  title?: string;
  nowMs?: number;
  maintenanceActive?: boolean;
}): StaffNotifyDecisionV1 {
  const nowMs = input.nowMs ?? Date.now();
  const eventClass = classifyStaffEventClassV1(input.eventType);
  const siteName = input.siteId
    ? opsSiteDisplayNameV1(input.siteId)
    : "現場";
  const keep = (deliver: boolean): StaffNotifyDecisionV1 => ({
    eventClass,
    deliver,
    titleKind: "keep",
    title: input.title || "",
  });
  if (!input.siteId || eventClass === "passthrough") return keep(true);
  const state = loadState();
  const slot = state.slots[canonicalOpsSiteKeyV1(input.siteId)] ?? emptySlot();
  const maintenance =
    input.maintenanceActive ??
    isMaintenanceActiveV1(input.siteId, nowMs);
  const working = maintenance || tempActive(slot, nowMs);
  if (eventClass === "critical_maintenance") {
    const deliver = slot.criticalEnabled !== false;
    return {
      eventClass,
      deliver,
      titleKind: deliver ? "staff" : "keep",
      title: deliver
        ? formatStaffNotifyTitleV1(input.title || "", siteName, "staff")
        : input.title || "",
    };
  }
  // 明示のOFFは板橋でも止める。未設定は板橋だけ常時。
  if (slot.normalAlways === false) return keep(false);
  const always =
    slot.normalAlways === true || isItabashiNotifySiteV1(input.siteId);
  if (always) {
    return {
      eventClass,
      deliver: true,
      titleKind: "staff",
      title: formatStaffNotifyTitleV1(
        input.title || "",
        siteName,
        "staff"
      ),
    };
  }
  if (working) {
    return {
      eventClass,
      deliver: true,
      titleKind: "staff_work",
      title: formatStaffNotifyTitleV1(
        input.title || "",
        siteName,
        "staff_work"
      ),
    };
  }
  return keep(false);
}

function formatHm(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function staffNotifyViewV1(
  siteId: string,
  nowMs: number = Date.now()
): StaffNotifyViewV1 {
  const itabashi = isItabashiNotifySiteV1(siteId);
  const state = loadState();
  const slot =
    state.slots[canonicalOpsSiteKeyV1(siteId)] ?? emptySlot();
  const maintenance = isMaintenanceActiveV1(siteId, nowMs);
  const tempOn = tempActive(slot, nowMs);
  const stopped = slot.normalAlways === false;
  const always =
    !stopped &&
    (slot.normalAlways === true || itabashi);
  const working = !stopped && !always && (maintenance || tempOn);
  let statusLabel = "通常イベントは停止中";
  let statusTone: StaffNotifyViewV1["statusTone"] = "off";
  if (always) {
    statusLabel = "常時受信（ON）";
    statusTone = "on";
  } else if (working) {
    statusLabel = tempOn && slot.tempNotifyUntil
      ? `作業受信中（${formatHm(slot.tempNotifyUntil)}まで）`
      : "点検中は社内受信ON";
    statusTone = "work";
  }
  const hint = itabashi
    ? "板橋自宅の通常イベントは常時届きます。止めるときは下の確認を使います。"
    : "通常のセンサー通知は停止中です。点検中か、下の作業タイマーのあいだだけ届きます。";
  return {
    itabashi,
    statusLabel,
    statusTone,
    hint,
    showWorkTimer: !always,
    tempNotifyUntil: tempOn ? slot.tempNotifyUntil : null,
    tempActive: tempOn,
    maintenanceActive: maintenance,
    criticalEnabled: slot.criticalEnabled !== false,
    alwaysLabel: itabashi
      ? "通常イベントを止める"
      : "通常イベントを常時受信する",
    alwaysChecked: itabashi ? stopped : slot.normalAlways === true,
  };
}

export function setStaffTempNotifyV1(
  siteId: string,
  minutes: number,
  nowMs: number = Date.now()
): StaffNotifyViewV1 {
  if (
    minutes !== 0 &&
    !STAFF_NOTIFY_PRESET_MINUTES_V1.includes(
      minutes as (typeof STAFF_NOTIFY_PRESET_MINUTES_V1)[number]
    )
  ) {
    throw new Error("invalid minutes");
  }
  const state = loadState();
  const slot = slotOf(state, canonicalOpsSiteKeyV1(siteId));
  slot.tempNotifyUntil =
    minutes === 0
      ? null
      : new Date(nowMs + minutes * 60 * 1000).toISOString();
  saveState(state);
  return staffNotifyViewV1(siteId, nowMs);
}

export function setStaffNormalAlwaysV1(
  siteId: string,
  value: boolean | null
): StaffNotifyViewV1 {
  const state = loadState();
  const slot = slotOf(state, canonicalOpsSiteKeyV1(siteId));
  slot.normalAlways = value;
  saveState(state);
  return staffNotifyViewV1(siteId);
}

export function setStaffCriticalEnabledV1(
  siteId: string,
  enabled: boolean
): StaffNotifyViewV1 {
  const state = loadState();
  const slot = slotOf(state, canonicalOpsSiteKeyV1(siteId));
  slot.criticalEnabled = enabled;
  saveState(state);
  return staffNotifyViewV1(siteId);
}

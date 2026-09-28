/**
 * TiSLY HOME — 防犯ライト手動遠隔操作 v1
 *
 * 外側100V (DO2/CH2) · 100V (DO3/CH3) を
 * RP2350 ポーリングキューへ即時投入する。
 */

import {
  findHomeSiteV1,
  HOME_ITABASHI_LIVE_SITE_ID_V1,
} from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  getRemoteTestStatus,
  queueSecurityLightCommandV1,
  queueSensorLinkedLightCommandV1,
  type SecurityLightCommandV1,
} from "../remote-test/remote-test-state.js";
import {
  getHomeSecurityRulesV1,
  getJstMinutesOfDayV1,
  isHomeGuardActiveV1,
  isHomeSecurityArmedV1,
  isWithinTimeRange,
  type HomeSecurityRulesV1,
} from "./home-security-rules-v1.js";

export type { SecurityLightCommandV1 };

export const SECURITY_LIGHT_COMMANDS_V1: SecurityLightCommandV1[] = [
  "light_24v_on",
  "light_24v_off",
  "light_24v_strobe",
  "light_100v_on",
  "light_100v_off",
  "light_all_on",
  "light_all_off",
];

const COMMAND_LABELS_JA_V1: Record<SecurityLightCommandV1, string> = {
  light_24v_on: "外側100V防犯ライトを点灯",
  light_24v_off: "外側100V防犯ライトを消灯",
  light_24v_strobe: "外側100V防犯ライトを威嚇点滅",
  light_100v_on: "100V投光器を点灯",
  light_100v_off: "100V投光器を消灯",
  light_all_on: "緊急全点灯",
  light_all_off: "全ライト消灯",
};

/** 実機 RP2350 連動物件か */
export function isHomeSecurityLightLiveSiteV1(siteId: string): boolean {
  const site = findHomeSiteV1(siteId);
  if (!site || site.id !== siteId) return false;
  return site.operationMode === "live" || site.kind === "live_home";
}

export function isSecurityLightCommandV1(
  action: string
): action is SecurityLightCommandV1 {
  return SECURITY_LIGHT_COMMANDS_V1.includes(
    action as SecurityLightCommandV1
  );
}

export interface HomeSecurityLightControlResultV1 {
  ok: boolean;
  error?: string;
  siteId?: string;
  command?: SecurityLightCommandV1;
  message?: string;
  queuedAt?: string;
  transport?: "remote_test_poll" | "tester_demo_mock" | string;
  mocked?: boolean;
  /** 手動命令は点灯時間帯をバイパス */
  bypassSchedule?: boolean;
}

/**
 * 手動ライト命令を VPS キューへ投入。
 * UI は /api/home/v1/control (target=security_light) 経由。
 * 点灯・威嚇点滅・緊急全点灯は
 * 点灯時間帯インターロックを完全バイパスする。
 */
export function applyHomeSecurityLightControlV1(input: {
  siteId: string;
  action: string;
  actor?: string | null;
  bypassSchedule?: boolean;
}): HomeSecurityLightControlResultV1 {
  const siteId = String(input.siteId || "").trim();
  const action = String(input.action || "").trim();
  /* 手動 PWA 即時命令は常に時間帯を無視する */
  const bypassSchedule = true;

  if (!siteId) {
    return { ok: false, error: "siteId が必要です" };
  }
  if (!isSecurityLightCommandV1(action)) {
    return { ok: false, error: "未対応のライト操作です" };
  }

  const site = findHomeSiteV1(siteId);
  if (!site || site.id !== siteId) {
    return { ok: false, error: "物件が見つかりません" };
  }
  if (!isHomeSecurityLightLiveSiteV1(siteId)) {
    return {
      ok: false,
      error: "この物件は防犯ライト実機連動に未対応です",
    };
  }

  const queued = queueSecurityLightCommandV1(action);
  if (!queued.ok) {
    return { ok: false, error: queued.error || "キュー投入に失敗しました" };
  }

  const message = `${site.displayName}: ${COMMAND_LABELS_JA_V1[action]}`;
  if (!queued.mocked) {
    recordSystemLogV1({
      siteId,
      tenantId: site.tenantId,
      category: "light_event",
      message,
      detail: {
        command: action,
        transport: "remote_test_poll",
        queuedAt: queued.queuedAt,
        bypassSchedule,
      },
      actor: input.actor ?? "app",
    });
  }

  return {
    ok: true,
    siteId,
    command: action,
    message,
    queuedAt: queued.queuedAt,
    transport: queued.transport ?? "remote_test_poll",
    mocked: queued.mocked === true,
    bypassSchedule,
  };
}

const SENSOR_PULSE_MIN_MS_V1 = 1_000;
const SENSOR_PULSE_MAX_MS_V1 = 300_000;

export interface HomeSensorLightWindowV1 {
  jstMinutes: number;
  isWithinTimeRange: boolean;
  armed: boolean;
  lightsActive: boolean;
}

export interface HomeSensorLinkedLightResultV1 {
  queued: boolean;
  skippedReason?: string;
  isWithinTimeRange: boolean;
  lightsActive: boolean;
  armed: boolean;
  command?: string;
  durationSec?: number;
  jstMinutes: number;
  mocked?: boolean;
}

/** JST 点灯窓と警戒状態を同じ関数で評価する */
export function evaluateHomeSensorLightWindowV1(
  rules: HomeSecurityRulesV1,
  at: Date = new Date()
): HomeSensorLightWindowV1 {
  const jstMinutes = getJstMinutesOfDayV1(at);
  const within = isWithinTimeRange(
    rules.scheduleStart,
    rules.scheduleEnd,
    at
  );
  const armed = isHomeSecurityArmedV1(rules, at);
  const lightsActive = isHomeGuardActiveV1(rules, at);
  return {
    jstMinutes,
    isWithinTimeRange: within,
    armed,
    lightsActive,
  };
}

function patternLetterForSensorV1(
  pattern: string | undefined,
  di: 1 | 2
): "A" | "B" | "C" {
  if (pattern === "pattern_b") return "B";
  if (pattern === "pattern_c") return "C";
  if (di === 2 && pattern !== "pattern_a") return "C";
  return "A";
}

function durationSecForSensorV1(
  rules: HomeSecurityRulesV1,
  letter: "A" | "B" | "C"
): number {
  if (letter === "B") {
    return rules.di2AlertDurationSec || rules.lightingDurationSec || 45;
  }
  if (letter === "C") {
    return (
      rules.di2StandaloneDurationSec || rules.lightingDurationSec || 45
    );
  }
  return rules.lightingDurationSec || rules.di1DurationSec || 45;
}

function clampSensorPulseMsV1(ms: number): number {
  if (!Number.isFinite(ms)) return 45_000;
  return Math.max(
    SENSOR_PULSE_MIN_MS_V1,
    Math.min(SENSOR_PULSE_MAX_MS_V1, Math.round(ms))
  );
}

/**
 * 実センサーと同じ JST 評価のあと、
 * 夜間窓内なら DO2+DO3 を維持秒数だけ点灯する。
 * 手動バイパス命令は使わず、時間後に自動消灯する。
 */
export function queueHomeSensorLinkedLightsV1(input: {
  siteId: string;
  di: 1 | 2;
  pattern?: string;
  actor?: string | null;
  at?: Date;
}): HomeSensorLinkedLightResultV1 {
  const siteId = String(input.siteId || "").trim();
  const at = input.at instanceof Date ? input.at : new Date();
  const rules = getHomeSecurityRulesV1(siteId);
  const windowEval = evaluateHomeSensorLightWindowV1(rules, at);
  const empty = {
    queued: false as const,
    isWithinTimeRange: windowEval.isWithinTimeRange,
    lightsActive: windowEval.lightsActive,
    armed: windowEval.armed,
    jstMinutes: windowEval.jstMinutes,
  };

  if (!isHomeSecurityLightLiveSiteV1(siteId)) {
    return { ...empty, skippedReason: "live_site_required" };
  }
  /* 点灯は時間帯＋警戒。19:00 JST なら窓内 */
  if (!windowEval.lightsActive) {
    return {
      ...empty,
      skippedReason: windowEval.isWithinTimeRange
        ? "guard_inactive"
        : "outside_schedule",
    };
  }

  const letter = patternLetterForSensorV1(input.pattern, input.di);
  const durationSec = durationSecForSensorV1(rules, letter);
  const durationMs = clampSensorPulseMsV1(durationSec * 1000);
  const command = `sensor_pulse_${letter}_${durationMs}`;
  const queued = queueSensorLinkedLightCommandV1(command);
  if (!queued.ok) {
    return {
      ...empty,
      skippedReason: queued.error || "queue_failed",
    };
  }

  if (!queued.mocked) {
    recordSystemLogV1({
      siteId,
      category: "light_event",
      message:
        `センサー連動点灯: DO2+DO3 ${durationSec}秒` +
        `（JST ${String(Math.floor(windowEval.jstMinutes / 60)).padStart(2, "0")}:${String(windowEval.jstMinutes % 60).padStart(2, "0")}）`,
      detail: {
        di: input.di,
        pattern: letter,
        command,
        durationMs,
        isWithinTimeRange: true,
        lightsActive: true,
        jstMinutes: windowEval.jstMinutes,
      },
      actor: input.actor ?? "rp2350",
    });
  }

  return {
    queued: true,
    isWithinTimeRange: true,
    lightsActive: true,
    armed: windowEval.armed,
    command,
    durationSec,
    jstMinutes: windowEval.jstMinutes,
    mocked: queued.mocked === true,
  };
}

const ITABASHI_SENSOR_ON_V1 = "light_all_on";
const ITABASHI_SENSOR_OFF_V1 = "light_all_off";
const ITABASHI_SENSOR_OFF_GRACE_MS_V1 = 20_000;

let sensorOffTimer: ReturnType<typeof setTimeout> | null = null;
let sensorRetryTimer: ReturnType<typeof setTimeout> | null = null;
let sensorOffDueMs = 0;

function rememberTimer(
  timer: ReturnType<typeof setTimeout>
): ReturnType<typeof setTimeout> {
  timer.unref?.();
  return timer;
}

function pendingBlocksSensorLightV1(command: string | null): boolean {
  if (!command) return false;
  return (
    command !== ITABASHI_SENSOR_ON_V1 &&
    command !== ITABASHI_SENSOR_OFF_V1
  );
}

/** テスト終了時に消灯タイマーを止める */
export function resetItabashiLiveSensorLightArmForTestV1(): void {
  if (sensorOffTimer) clearTimeout(sensorOffTimer);
  if (sensorRetryTimer) clearTimeout(sensorRetryTimer);
  sensorOffTimer = null;
  sensorRetryTimer = null;
  sensorOffDueMs = 0;
}

function scheduleItabashiSensorLightOffV1(waitMs: number): void {
  if (sensorOffTimer) clearTimeout(sensorOffTimer);
  const wait = Math.max(200, waitMs);
  sensorOffTimer = rememberTimer(
    setTimeout(() => {
      sensorOffTimer = null;
      flushItabashiSensorLightOffV1();
    }, wait)
  );
}

function flushItabashiSensorLightOffV1(): void {
  const now = Date.now();
  if (now + 50 < sensorOffDueMs) {
    scheduleItabashiSensorLightOffV1(sensorOffDueMs - now);
    return;
  }
  const pending = getRemoteTestStatus().pendingCommand;
  if (pending === ITABASHI_SENSOR_ON_V1) {
    scheduleItabashiSensorLightOffV1(1000);
    return;
  }
  if (
    pendingBlocksSensorLightV1(pending) &&
    now < sensorOffDueMs + ITABASHI_SENSOR_OFF_GRACE_MS_V1
  ) {
    scheduleItabashiSensorLightOffV1(1000);
    return;
  }
  const queued = queueSecurityLightCommandV1(ITABASHI_SENSOR_OFF_V1);
  sensorOffDueMs = 0;
  if (!queued.ok || queued.mocked) return;
  recordSystemLogV1({
    siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    category: "light_event",
    message: "センサー連動消灯: DO2+DO3",
    detail: { command: ITABASHI_SENSOR_OFF_V1 },
    actor: "rp2350",
  });
}

function queueItabashiSensorLightOnV1(
  durationSec: number,
  detail: Record<string, unknown>,
  attempt = 0
): { queued: boolean; skippedReason?: string } {
  const pending = getRemoteTestStatus().pendingCommand;
  if (pendingBlocksSensorLightV1(pending)) {
    if (attempt >= 8) {
      return { queued: false, skippedReason: "pending_command_busy" };
    }
    if (sensorRetryTimer) clearTimeout(sensorRetryTimer);
    sensorRetryTimer = rememberTimer(
      setTimeout(() => {
        sensorRetryTimer = null;
        queueItabashiSensorLightOnV1(durationSec, detail, attempt + 1);
      }, 400)
    );
    return { queued: false, skippedReason: "pending_command_busy" };
  }
  const queued = queueSecurityLightCommandV1(ITABASHI_SENSOR_ON_V1);
  if (!queued.ok || queued.mocked) {
    return {
      queued: false,
      skippedReason: queued.mocked ? "mocked" : queued.error || "queue_failed",
    };
  }
  const holdMs = clampSensorPulseMsV1(durationSec * 1000);
  const due = Date.now() + holdMs;
  if (due > sensorOffDueMs) sensorOffDueMs = due;
  scheduleItabashiSensorLightOffV1(sensorOffDueMs - Date.now());
  recordSystemLogV1({
    siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    category: "light_event",
    message: `センサー連動点灯: DO2+DO3 を${durationSec}秒点灯`,
    detail: {
      ...detail,
      command: ITABASHI_SENSOR_ON_V1,
      durationSec,
    },
    actor: "rp2350",
  });
  return { queued: true };
}

/**
 * 実センサーの立上りで DO2+DO3 を点灯する。
 * 板橋実機 1.6.1 は sensor_pulse を捨て、
 * ルール version が変わらない限り夜間でも点灯しない。
 * 手動と同じ light_all_on を使い、維持秒数後に消灯する。
 */
export function armItabashiLiveDiSensorLightsV1(input: {
  siteId: string;
  di: 1 | 2;
  pattern?: string;
  at?: Date;
}): HomeSensorLinkedLightResultV1 {
  const siteId = String(input.siteId || "").trim();
  const at = input.at instanceof Date ? input.at : new Date();
  const rules = getHomeSecurityRulesV1(siteId);
  const windowEval = evaluateHomeSensorLightWindowV1(rules, at);
  const empty = {
    queued: false as const,
    isWithinTimeRange: windowEval.isWithinTimeRange,
    lightsActive: windowEval.lightsActive,
    armed: windowEval.armed,
    jstMinutes: windowEval.jstMinutes,
  };
  if (siteId !== HOME_ITABASHI_LIVE_SITE_ID_V1) {
    return { ...empty, skippedReason: "itabashi_only" };
  }
  if (!windowEval.lightsActive) {
    return {
      ...empty,
      skippedReason: windowEval.isWithinTimeRange
        ? "guard_inactive"
        : "outside_schedule",
    };
  }
  const letter = patternLetterForSensorV1(input.pattern, input.di);
  const durationSec = durationSecForSensorV1(rules, letter);
  const armed = queueItabashiSensorLightOnV1(durationSec, {
    di: input.di,
    pattern: letter,
    jstMinutes: windowEval.jstMinutes,
  });
  if (!armed.queued) {
    return { ...empty, skippedReason: armed.skippedReason };
  }
  return {
    queued: true,
    isWithinTimeRange: true,
    lightsActive: true,
    armed: windowEval.armed,
    command: ITABASHI_SENSOR_ON_V1,
    durationSec,
    jstMinutes: windowEval.jstMinutes,
  };
}

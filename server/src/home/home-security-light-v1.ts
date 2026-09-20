/**
 * TiSLY HOME — 防犯ライト手動遠隔操作 v1
 *
 * 外側100V (DO2/CH2) · 100V (DO3/CH3) を
 * RP2350 ポーリングキューへ即時投入する。
 */

import { findHomeSiteV1 } from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
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

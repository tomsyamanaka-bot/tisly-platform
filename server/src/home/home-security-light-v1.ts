/**
 * TiSLY HOME — 防犯ライト手動遠隔操作 v1
 *
 * 24V (DO2/CH2) · 100V (DO3/CH3) を
 * RP2350 ポーリングキューへ即時投入する。
 */

import { findHomeSiteV1 } from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  queueSecurityLightCommandV1,
  type SecurityLightCommandV1,
} from "../remote-test/remote-test-state.js";

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
  light_24v_on: "24V防犯ライトを点灯",
  light_24v_off: "24V防犯ライトを消灯",
  light_24v_strobe: "24V防犯ライトを威嚇点滅",
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
  transport?: "remote_test_poll";
}

/**
 * 手動ライト命令を VPS キューへ投入。
 * UI は /api/home/v1/control (target=security_light) 経由。
 */
export function applyHomeSecurityLightControlV1(input: {
  siteId: string;
  action: string;
  actor?: string | null;
}): HomeSecurityLightControlResultV1 {
  const siteId = String(input.siteId || "").trim();
  const action = String(input.action || "").trim();

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
  recordSystemLogV1({
    siteId,
    tenantId: site.tenantId,
    category: "light_event",
    message,
    detail: {
      command: action,
      transport: "remote_test_poll",
      queuedAt: queued.queuedAt,
    },
    actor: input.actor ?? "app",
  });

  return {
    ok: true,
    siteId,
    command: action,
    message,
    queuedAt: queued.queuedAt,
    transport: "remote_test_poll",
  };
}

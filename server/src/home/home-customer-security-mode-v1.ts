/**
 * 顧客向け Security 警戒モード v1
 *
 * おでかけ / 在宅 / 一時解除を
 * 既存 rules に merge して実機と同期する。
 * 既存フィールドは削除せず追記のみ。
 */

import {
  getHomeSecurityRulesV1,
  updateHomeSecurityRulesV1,
  type HomeSecurityRulesV1,
  type HomeSecurityRulesPatchV1,
} from "./home-security-rules-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";

/** 顧客ワンタップ警戒モード */
export type CustomerSecurityModeV1 = "away" | "home" | "disarmed";

export interface CustomerSecurityModeOptionV1 {
  id: CustomerSecurityModeV1;
  label: string;
  emoji: string;
  description: string;
}

export const CUSTOMER_SECURITY_MODE_OPTIONS_V1: CustomerSecurityModeOptionV1[] =
  [
    {
      id: "away",
      label: "おでかけ警戒",
      emoji: "🏃‍♂️",
      description:
        "全センサー24時間フル発報。ライト即時点灯・パトライト威嚇・緊急Push。",
    },
    {
      id: "home",
      label: "在宅見守り",
      emoji: "🏠",
      description:
        "外周センサーのみ有効。夜間は外構ライトを優しく点灯し静かな通知。",
    },
    {
      id: "disarmed",
      label: "警戒一時解除",
      emoji: "⏸️",
      description:
        "庭の手入れ・来客用。ライト・パトライト・緊急通知を一時停止（ログのみ）。",
    },
  ];

const MODE_IDS: CustomerSecurityModeV1[] = [
  "away",
  "home",
  "disarmed",
];

export function isCustomerSecurityModeV1(
  value: unknown
): value is CustomerSecurityModeV1 {
  return (
    typeof value === "string" &&
    MODE_IDS.includes(value as CustomerSecurityModeV1)
  );
}

export function customerSecurityModeLabelV1(
  mode: CustomerSecurityModeV1
): string {
  return (
    CUSTOMER_SECURITY_MODE_OPTIONS_V1.find((m) => m.id === mode)
      ?.label ?? mode
  );
}

/**
 * 既存 rules から顧客モードを推定
 * （customerSecurityMode 未保存時の互換）
 */
export function deriveCustomerSecurityModeV1(
  rules: HomeSecurityRulesV1 & { customerSecurityMode?: string }
): CustomerSecurityModeV1 {
  const stored = rules.customerSecurityMode;
  if (isCustomerSecurityModeV1(stored)) return stored;
  if (rules.guardMode === "off") return "disarmed";
  if (rules.guardMode === "always") return "away";
  return "home";
}

/** モード → rules パッチ（既存キーのみ更新） */
export function buildCustomerSecurityModePatchV1(
  mode: CustomerSecurityModeV1
): HomeSecurityRulesPatchV1 & { customerSecurityMode: CustomerSecurityModeV1 } {
  if (mode === "away") {
    return {
      customerSecurityMode: "away",
      guardMode: "always",
      /* 00:00〜00:00 でライト窓を常時有効 */
      scheduleStart: "00:00",
      scheduleEnd: "00:00",
      securityPausedUntil: null,
      notifyDi1Mode: "critical",
      notifyDi2Mode: "critical",
      notifyStagedMode: "critical",
      notifyDi1SilentLogOnly: false,
      notifyDi2InstantPush: true,
    };
  }
  if (mode === "home") {
    return {
      customerSecurityMode: "home",
      guardMode: "scheduled",
      scheduleStart: "18:00",
      scheduleEnd: "06:00",
      securityPausedUntil: null,
      /* 外周は静かな通知、母屋はサイレント */
      notifyDi1Mode: "silent",
      notifyDi2Mode: "silent",
      notifyStagedMode: "off",
      notifyDi1SilentLogOnly: false,
      notifyDi2InstantPush: true,
    };
  }
  return {
    customerSecurityMode: "disarmed",
    guardMode: "off",
    securityPausedUntil: null,
    notifyDi1Mode: "off",
    notifyDi2Mode: "off",
    notifyStagedMode: "off",
    notifyDi1SilentLogOnly: true,
    notifyDi2InstantPush: false,
  };
}

/** 顧客モードを保存し実機ルールへ反映 */
export function applyCustomerSecurityModeV1(input: {
  siteId: string;
  mode: CustomerSecurityModeV1;
  actor?: string;
}): {
  ok: boolean;
  mode: CustomerSecurityModeV1;
  modeLabel: string;
  rules: HomeSecurityRulesV1;
} {
  const siteId = String(input.siteId || "").trim();
  const mode = input.mode;
  if (!siteId || !isCustomerSecurityModeV1(mode)) {
    throw new Error("siteId と mode が必要です");
  }
  const patch = buildCustomerSecurityModePatchV1(mode);
  const rules = updateHomeSecurityRulesV1(siteId, patch);
  recordSystemLogV1({
    siteId,
    category: "manual_control",
    message: `警戒モード切替: ${customerSecurityModeLabelV1(mode)}`,
    detail: { mode, guardMode: rules.guardMode },
    actor: input.actor || "customer-portal",
  });
  return {
    ok: true,
    mode,
    modeLabel: customerSecurityModeLabelV1(mode),
    rules,
  };
}

/** 現在の顧客モード */
export function getCustomerSecurityModeV1(
  siteId: string
): {
  mode: CustomerSecurityModeV1;
  modeLabel: string;
  options: CustomerSecurityModeOptionV1[];
  rules: HomeSecurityRulesV1;
} {
  const rules = getHomeSecurityRulesV1(siteId);
  const mode = deriveCustomerSecurityModeV1(
    rules as HomeSecurityRulesV1 & { customerSecurityMode?: string }
  );
  return {
    mode,
    modeLabel: customerSecurityModeLabelV1(mode),
    options: CUSTOMER_SECURITY_MODE_OPTIONS_V1,
    rules,
  };
}

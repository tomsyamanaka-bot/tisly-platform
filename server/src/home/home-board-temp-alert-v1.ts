/**
 * 盤内温度 2段階アラート v1
 * 50℃は TOMS のみ、60℃は双方へ送る。
 * 既存しきい値は削除せず追記する。
 */

export const BOARD_TEMP_FAN_ON_C_V1 = 45.0;
export const BOARD_TEMP_FAN_OFF_C_V1 = 40.0;
export const BOARD_TEMP_TOMS_ALERT_C_V1 = 50.0;
export const BOARD_TEMP_EMERGENCY_C_V1 = 60.0;
export const BOARD_TEMP_TOMS_CLEAR_C_V1 = 48.0;

export const TOMS_OPS_PUSH_USER_ID_V1 = "toms-ops";
export const CUSTOMER_PUSH_USER_ID_V1 = "customer-security";

export type BoardTempPushAudienceV1 = "toms" | "customer" | "all";

export interface BoardTempAlertLatchesV1 {
  tomsNotified: boolean;
  emergencyNotified: boolean;
}

export interface BoardTempAlertDecisionV1 extends BoardTempAlertLatchesV1 {
  fireToms: boolean;
  fireEmergency: boolean;
}

/** TOMS 保守端末の購読 user_id */
export function isTomsOpsPushUserV1(userId: string): boolean {
  const id = String(userId || "").trim();
  return (
    id === TOMS_OPS_PUSH_USER_ID_V1 ||
    id === "admin-default" ||
    id === "remote-test"
  );
}

/** 施主端末の購読 user_id */
export function isCustomerPushUserV1(userId: string): boolean {
  const id = String(userId || "").trim();
  if (id === CUSTOMER_PUSH_USER_ID_V1) return true;
  return id.startsWith("cu-");
}

export function resolvePushAudienceUserIdV1(
  audience: string | undefined,
  fallbackUserId: string
): string {
  const a = String(audience || "").trim().toLowerCase();
  if (a === "toms") return TOMS_OPS_PUSH_USER_ID_V1;
  if (a === "customer") return CUSTOMER_PUSH_USER_ID_V1;
  return fallbackUserId;
}

export function buildBoardTempTomsPushV1(siteLabel: string): {
  title: string;
  body: string;
  eventType: string;
} {
  /* 50℃は社内先回り点検のみ */
  const body =
    `⚠️ ${siteLabel}：盤内温度が50℃に達しました。` +
    `ファン冷却不良の可能性があります。先回り点検を検討してください。`;
  return {
    title: body,
    body,
    eventType: "board_temp_toms_preemptive",
  };
}

export function buildBoardTempEmergencyPushV1(siteLabel: string): {
  title: string;
  body: string;
  eventType: string;
} {
  /* 60℃は熱暴走の緊急通知 */
  const body =
    `🚨 ${siteLabel}：主装置の盤内温度が60℃を超えました。` +
    `熱暴走の危険があります。`;
  return {
    title: body,
    body,
    eventType: "board_temp_emergency",
  };
}

/** ラッチと発火判定。5分HBの連打を防ぐ */
export function nextBoardTempAlertLatchesV1(
  tempC: number,
  latches: BoardTempAlertLatchesV1
): BoardTempAlertDecisionV1 {
  if (tempC >= BOARD_TEMP_EMERGENCY_C_V1) {
    return {
      tomsNotified: true,
      emergencyNotified: true,
      fireToms: false,
      fireEmergency: !latches.emergencyNotified,
    };
  }
  if (tempC >= BOARD_TEMP_TOMS_ALERT_C_V1) {
    return {
      tomsNotified: true,
      emergencyNotified: false,
      fireToms: !latches.tomsNotified,
      fireEmergency: false,
    };
  }
  return {
    tomsNotified:
      tempC < BOARD_TEMP_TOMS_CLEAR_C_V1 ? false : latches.tomsNotified,
    emergencyNotified: false,
    fireToms: false,
    fireEmergency: false,
  };
}

export function formatCustomerBoardTempLabelV1(
  c: number | null,
  empty = "正常監視中"
): string {
  if (c == null || Number.isNaN(c)) return empty;
  if (c >= BOARD_TEMP_EMERGENCY_C_V1) {
    return `${c.toFixed(1)}℃（警告）`;
  }
  if (c >= BOARD_TEMP_TOMS_ALERT_C_V1) {
    return `${c.toFixed(1)}℃（軽微な注意）`;
  }
  return `${c.toFixed(1)}℃（適温・正常）`;
}

export function customerBoardTempLevelV1(
  c: number | null
): "normal" | "caution" | "warning" {
  if (c == null || Number.isNaN(c)) return "normal";
  if (c >= BOARD_TEMP_EMERGENCY_C_V1) return "warning";
  return "normal";
}

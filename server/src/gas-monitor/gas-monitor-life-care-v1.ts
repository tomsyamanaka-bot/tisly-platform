/**
 * TiSLY Life Care（見守り）ステータス
 * ミリ波レーダー / パルス連携を想定した
 * オーバーレイ定義（既存物件データは非破壊）
 */

export type GasLifeCareStatusV1 =
  | "normal"
  | "no_gas_24h"
  | "bath_toilet_long"
  | "quake_shutoff";

export type GasMmWaveZoneV1 =
  | "bathroom"
  | "toilet"
  | "living"
  | "kitchen"
  | "unknown";

/** ミリ波プレゼンス（将来の実機連携受け皿） */
export interface GasMmWavePresenceV1 {
  detected: boolean;
  zone: GasMmWaveZoneV1;
  /** 滞留分（分） */
  dwellMinutes: number;
  lastMotionAt: string;
  /** パルスメーター最終検知（ISO） */
  lastGasPulseAt: string | null;
}

export interface GasLifeCareOverlayV1 {
  propertyId: string;
  status: GasLifeCareStatusV1;
  statusEmoji: string;
  statusLabel: string;
  /** 黄・赤は視覚警報対象 */
  alertLevel: "none" | "warn" | "critical";
  mmWave: GasMmWavePresenceV1;
}

const LIFE_CARE_LABELS: Record<
  GasLifeCareStatusV1,
  { emoji: string; label: string; alertLevel: "none" | "warn" | "critical" }
> = {
  normal: {
    emoji: "🟢",
    label: "正常生活反応",
    alertLevel: "none",
  },
  no_gas_24h: {
    emoji: "🟡",
    label: "24時間ガス未検知",
    alertLevel: "warn",
  },
  bath_toilet_long: {
    emoji: "🔴",
    label: "浴室・トイレ長滞留警報",
    alertLevel: "critical",
  },
  quake_shutoff: {
    emoji: "🚨",
    label: "地震自動遮断",
    alertLevel: "critical",
  },
};

/**
 * 物件ID → Life Care オーバーレイ
 * 既存物件オブジェクトは変更せずここで付与
 */
export const GAS_MONITOR_LIFE_CARE_BY_PROPERTY_V1: Readonly<
  Record<string, GasLifeCareStatusV1>
> = {
  "GAS-JP-HOME-001": "normal",
  "GAS-JP-APT-201": "no_gas_24h",
  "GAS-JP-APT-305": "normal",
  "GAS-JP-SHOP-001": "normal",
  "GAS-JP-HOME-ALERT": "quake_shutoff",
  "GAS-AU-HOME-001": "normal",
  // 追記: アパート追加部屋
  "GAS-JP-APT-102": "normal",
  "GAS-JP-APT-403": "bath_toilet_long",
  // 追記: AU アパート
  "GAS-AU-APT-12A": "no_gas_24h",
  "GAS-AU-APT-12B": "normal",
};

/** ミリ波モック（追記） */
export const GAS_MONITOR_MMWAVE_BY_PROPERTY_V1: Readonly<
  Record<string, GasMmWavePresenceV1>
> = {
  "GAS-JP-HOME-001": {
    detected: true,
    zone: "living",
    dwellMinutes: 12,
    lastMotionAt: "2026-08-13T06:45:00+09:00",
    lastGasPulseAt: "2026-08-13T07:15:00+09:00",
  },
  "GAS-JP-APT-201": {
    detected: false,
    zone: "unknown",
    dwellMinutes: 0,
    lastMotionAt: "2026-08-12T09:10:00+09:00",
    lastGasPulseAt: "2026-08-12T08:55:00+09:00",
  },
  "GAS-JP-APT-305": {
    detected: true,
    zone: "kitchen",
    dwellMinutes: 4,
    lastMotionAt: "2026-08-13T08:00:00+09:00",
    lastGasPulseAt: "2026-08-13T08:05:00+09:00",
  },
  "GAS-JP-SHOP-001": {
    detected: true,
    zone: "kitchen",
    dwellMinutes: 45,
    lastMotionAt: "2026-08-13T11:15:00+09:00",
    lastGasPulseAt: "2026-08-13T11:20:00+09:00",
  },
  "GAS-JP-HOME-ALERT": {
    detected: false,
    zone: "unknown",
    dwellMinutes: 0,
    lastMotionAt: "2026-08-13T05:30:00+09:00",
    lastGasPulseAt: null,
  },
  "GAS-AU-HOME-001": {
    detected: true,
    zone: "living",
    dwellMinutes: 8,
    lastMotionAt: "2026-08-13T07:20:00+10:00",
    lastGasPulseAt: "2026-08-13T07:30:00+10:00",
  },
  "GAS-JP-APT-102": {
    detected: true,
    zone: "living",
    dwellMinutes: 6,
    lastMotionAt: "2026-08-13T07:40:00+09:00",
    lastGasPulseAt: "2026-08-13T07:50:00+09:00",
  },
  "GAS-JP-APT-403": {
    detected: true,
    zone: "bathroom",
    dwellMinutes: 48,
    lastMotionAt: "2026-08-13T06:10:00+09:00",
    lastGasPulseAt: "2026-08-13T06:05:00+09:00",
  },
  "GAS-AU-APT-12A": {
    detected: false,
    zone: "unknown",
    dwellMinutes: 0,
    lastMotionAt: "2026-08-12T10:00:00+10:00",
    lastGasPulseAt: "2026-08-12T09:40:00+10:00",
  },
  "GAS-AU-APT-12B": {
    detected: true,
    zone: "kitchen",
    dwellMinutes: 3,
    lastMotionAt: "2026-08-13T08:10:00+10:00",
    lastGasPulseAt: "2026-08-13T08:15:00+10:00",
  },
};

const DEFAULT_MMWAVE: GasMmWavePresenceV1 = {
  detected: false,
  zone: "unknown",
  dwellMinutes: 0,
  lastMotionAt: "2026-08-13T00:00:00+09:00",
  lastGasPulseAt: null,
};

/**
 * 緊急遮断中は地震遮断ステータスを優先
 */
export function resolveLifeCareStatusV1(
  propertyId: string,
  emergencyShutoff: boolean
): GasLifeCareStatusV1 {
  if (emergencyShutoff) return "quake_shutoff";
  return (
    GAS_MONITOR_LIFE_CARE_BY_PROPERTY_V1[propertyId] || "normal"
  );
}

export function buildLifeCareOverlayV1(
  propertyId: string,
  emergencyShutoff: boolean
): GasLifeCareOverlayV1 {
  const status = resolveLifeCareStatusV1(
    propertyId,
    emergencyShutoff
  );
  const meta = LIFE_CARE_LABELS[status];
  const mmWave =
    GAS_MONITOR_MMWAVE_BY_PROPERTY_V1[propertyId] || DEFAULT_MMWAVE;
  return {
    propertyId,
    status,
    statusEmoji: meta.emoji,
    statusLabel: meta.label,
    alertLevel: meta.alertLevel,
    mmWave: { ...mmWave },
  };
}

export function isLifeCareAlertV1(
  status: GasLifeCareStatusV1
): boolean {
  return status !== "normal";
}

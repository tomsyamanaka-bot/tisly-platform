/**
 * 音声誘導ナビ v1 — セッション状態型
 * 将来の MQTT リレー遮断連携を見据えた
 * クリーンな状態モデル
 */

export const VOICE_NAV_STATE_SCHEMA_VERSION = 1 as const;

/** 調査・停電確認の進行ステータス */
export const VOICE_NAV_INVESTIGATION_STATUSES = [
  "idle",
  "awaiting_breaker_off",
  "verifying_outage",
  "outage_confirmed",
  "completed",
  "error",
] as const;

export type VoiceNavInvestigationStatusV1 =
  (typeof VOICE_NAV_INVESTIGATION_STATUSES)[number];

/** 将来 IoT 連携用 — リレー制御モード */
export const VOICE_NAV_RELAY_MODES = ["mock", "mqtt"] as const;

export type VoiceNavRelayModeV1 = (typeof VOICE_NAV_RELAY_MODES)[number];

/**
 * 1 セッション分の状態
 * （クライアント / サーバー / MQTT ブリッジ共通）
 */
export interface VoiceNavSessionStateV1 {
  schemaVersion: typeof VOICE_NAV_STATE_SCHEMA_VERSION;
  /** 対象回路番号（分電盤ブレーカー番号） */
  targetCircuitNumber: number;
  /** 調査ステータス */
  investigationStatus: VoiceNavInvestigationStatusV1;
  /** シーケンス上の現在ステップ（0 始まり） */
  currentStepIndex: number;
  /** セッション開始 ISO8601（未開始は null） */
  startedAt: string | null;
  /** 直近の音声認識テキスト */
  lastVoiceCommand: string | null;
  /** リレー制御モード（現状 mock 固定） */
  relayMode: VoiceNavRelayModeV1;
  /**
   * 将来 MQTT 用 — 遮断対象トピック
   * 例: tisly/relay/breaker/1/command
   */
  mqttRelayTopic: string | null;
  /** エラー概要（error 時のみ） */
  lastError: string | null;
}

/** 初期セッション状態を生成 */
export function createInitialVoiceNavSessionV1(
  circuitNumber = 1
): VoiceNavSessionStateV1 {
  return {
    schemaVersion: VOICE_NAV_STATE_SCHEMA_VERSION,
    targetCircuitNumber: circuitNumber,
    investigationStatus: "idle",
    currentStepIndex: 0,
    startedAt: null,
    lastVoiceCommand: null,
    relayMode: "mock",
    mqttRelayTopic: buildVoiceNavMqttTopicV1(circuitNumber),
    lastError: null,
  };
}

/** 回路番号から MQTT トピックを組み立て（将来実装用） */
export function buildVoiceNavMqttTopicV1(circuitNumber: number): string {
  return `tisly/relay/breaker/${circuitNumber}/command`;
}

/** 状態遷移入力 */
export interface VoiceNavStatePatchV1 {
  investigationStatus?: VoiceNavInvestigationStatusV1;
  currentStepIndex?: number;
  lastVoiceCommand?: string | null;
  lastError?: string | null;
  targetCircuitNumber?: number;
  mqttRelayTopic?: string | null;
  startedAt?: string | null;
}

/** イミュータブルに状態を更新 */
export function patchVoiceNavSessionV1(
  prev: VoiceNavSessionStateV1,
  patch: VoiceNavStatePatchV1
): VoiceNavSessionStateV1 {
  const circuit =
    patch.targetCircuitNumber ?? prev.targetCircuitNumber;
  return {
    ...prev,
    ...patch,
    targetCircuitNumber: circuit,
    mqttRelayTopic:
      patch.mqttRelayTopic ??
      (patch.targetCircuitNumber != null
        ? buildVoiceNavMqttTopicV1(circuit)
        : prev.mqttRelayTopic),
  };
}

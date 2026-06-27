/**
 * 音声誘導ナビ v1 — クライアント状態ストア
 * サーバー型 voice-nav-state-v1 と同形の
 * セッション状態を保持
 */

export const VOICE_NAV_STATE_SCHEMA_VERSION = 1;

/**
 * @typedef {object} VoiceNavClientState
 * @property {number} schemaVersion
 * @property {number} targetCircuitNumber
 * @property {'idle'|'awaiting_breaker_off'|'verifying_outage'|'outage_confirmed'|'completed'|'error'} investigationStatus
 * @property {number} currentStepIndex
 * @property {string|null} startedAt
 * @property {string|null} lastVoiceCommand
 * @property {'mock'|'mqtt'} relayMode
 * @property {string|null} mqttRelayTopic
 * @property {string|null} lastError
 */

/**
 * @param {number} [circuitNumber]
 * @returns {VoiceNavClientState}
 */
export function createInitialVoiceNavClientStateV1(circuitNumber = 1) {
  return {
    schemaVersion: VOICE_NAV_STATE_SCHEMA_VERSION,
    targetCircuitNumber: circuitNumber,
    investigationStatus: "idle",
    currentStepIndex: 0,
    startedAt: null,
    lastVoiceCommand: null,
    relayMode: "mock",
    mqttRelayTopic: buildVoiceNavMqttTopicClientV1(circuitNumber),
    lastError: null,
  };
}

/**
 * @param {number} circuitNumber
 * @returns {string}
 */
export function buildVoiceNavMqttTopicClientV1(circuitNumber) {
  return `tisly/relay/breaker/${circuitNumber}/command`;
}

/**
 * @param {VoiceNavClientState} prev
 * @param {Partial<VoiceNavClientState>} patch
 * @returns {VoiceNavClientState}
 */
export function patchVoiceNavClientStateV1(prev, patch) {
  const circuit = patch.targetCircuitNumber ?? prev.targetCircuitNumber;
  return {
    ...prev,
    ...patch,
    targetCircuitNumber: circuit,
    mqttRelayTopic:
      patch.mqttRelayTopic ??
      (patch.targetCircuitNumber != null
        ? buildVoiceNavMqttTopicClientV1(circuit)
        : prev.mqttRelayTopic),
  };
}

/**
 * @param {VoiceNavClientState} state
 * @param {(next: VoiceNavClientState) => void} listener
 */
export function createVoiceNavStateStoreV1(state, listener) {
  /** @type {VoiceNavClientState} */
  let current = { ...state };

  return {
    getState() {
      return current;
    },
    /** @param {Partial<VoiceNavClientState>} patch */
    patch(patch) {
      current = patchVoiceNavClientStateV1(current, patch);
      listener(current);
      return current;
    },
    reset(circuitNumber = 1) {
      current = createInitialVoiceNavClientStateV1(circuitNumber);
      listener(current);
      return current;
    },
  };
}

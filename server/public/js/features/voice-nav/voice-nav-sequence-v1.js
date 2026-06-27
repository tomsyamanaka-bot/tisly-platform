/**
 * 音声誘導ナビ v1 — クライアント疑似シーケンス
 * 発話指示と肯定応答判定
 */

/** @typedef {import('./voice-nav-state-v1.js').VoiceNavClientState} VoiceNavClientState */

/** 職人の肯定応答（部分一致） */
export const VOICE_NAV_ACK_PATTERNS = [
  /落とした/,
  /落としました/,
  /オッケー/,
  /オーケー/,
  /了解/,
  /完了/,
  /^ok$/i,
  /オーケ/i,
];

/**
 * @typedef {object} VoiceNavSequenceStep
 * @property {string} id
 * @property {string} prompt
 * @property {VoiceNavClientState['investigationStatus']} awaitStatus
 * @property {VoiceNavClientState['investigationStatus']} nextStatus
 * @property {string} [nextPrompt]
 * @property {number} [targetCircuitNumber]
 * @property {number|null} [nextCircuitNumber]
 */

/**
 * @param {number} circuitNumber
 * @returns {VoiceNavSequenceStep[]}
 */
export function buildVoiceNavDemoSequenceClientV1(circuitNumber) {
  const n = String(circuitNumber);
  return [
    {
      id: "breaker_off",
      prompt: `${n}番ブレーカーを落としてください`,
      awaitStatus: "awaiting_breaker_off",
      nextStatus: "verifying_outage",
      nextPrompt: `${n}番、停電確認中……`,
    },
    {
      id: "verify_outage",
      prompt: `${n}番、停電確認中……`,
      awaitStatus: "verifying_outage",
      nextStatus: "outage_confirmed",
    },
  ];
}

/**
 * 複数回路連続チェック用シーケンス
 * @param {number[]} circuitNumbers
 * @returns {VoiceNavSequenceStep[]}
 */
export function buildVoiceNavMultiCircuitSequenceClientV1(circuitNumbers) {
  const nums = (circuitNumbers || []).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return buildVoiceNavDemoSequenceClientV1(1);

  /** @type {VoiceNavSequenceStep[]} */
  const steps = [];
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    const next = nums[i + 1];
    const ns = String(n);
    steps.push({
      id: `breaker_off_${n}`,
      prompt: `${ns}番ブレーカーを落としてください`,
      awaitStatus: "awaiting_breaker_off",
      nextStatus: next ? "awaiting_breaker_off" : "completed",
      nextPrompt: next
        ? `${ns}番の停電を検知、次へ進みます。${next}番を落としてください`
        : `${ns}番の停電を検知、すべての回路チェックが完了しました`,
      targetCircuitNumber: n,
      nextCircuitNumber: next ?? null,
    });
  }
  return steps;
}

/**
 * @param {string} transcript
 * @returns {boolean}
 */
export function isVoiceNavAckCommandClientV1(transcript) {
  const t = transcript.trim();
  if (!t) return false;
  return VOICE_NAV_ACK_PATTERNS.some((re) => re.test(t));
}

/**
 * @param {VoiceNavClientState} state
 * @param {VoiceNavSequenceStep[]} steps
 * @param {typeof import('./voice-nav-state-v1.js').patchVoiceNavClientStateV1} patchFn
 */
export function startVoiceNavSequenceClientV1(state, steps, patchFn) {
  const first = steps[0];
  if (!first) {
    return {
      state: patchFn(state, {
        investigationStatus: "error",
        lastError: "シーケンスが空です",
      }),
      prompt: "",
    };
  }
  return {
    state: patchFn(state, {
      investigationStatus: first.awaitStatus,
      currentStepIndex: 0,
      targetCircuitNumber: first.targetCircuitNumber ?? state.targetCircuitNumber,
      startedAt: state.startedAt ?? new Date().toISOString(),
      lastError: null,
    }),
    prompt: first.prompt,
  };
}

/**
 * @param {VoiceNavClientState} state
 * @param {VoiceNavSequenceStep[]} steps
 * @param {string} transcript
 * @param {typeof import('./voice-nav-state-v1.js').patchVoiceNavClientStateV1} patchFn
 */
export function advanceVoiceNavSequenceClientV1(
  state,
  steps,
  transcript,
  patchFn
) {
  if (!isVoiceNavAckCommandClientV1(transcript)) {
    return {
      state: patchFn(state, { lastVoiceCommand: transcript }),
      prompt: null,
      advanced: false,
    };
  }

  const step = steps[state.currentStepIndex];
  if (!step) {
    return {
      state: patchFn(state, {
        lastVoiceCommand: transcript,
        investigationStatus: "completed",
      }),
      prompt: null,
      advanced: true,
    };
  }

  const nextIndex = state.currentStepIndex + 1;
  const nextStep = steps[nextIndex];
  const promptAfterAck = step.nextPrompt ?? nextStep?.prompt ?? null;

  let nextStatus = step.nextStatus;
  if (!nextStep && !step.nextPrompt) {
    nextStatus = "completed";
  } else if (nextStep && !step.nextPrompt) {
    nextStatus = nextStep.awaitStatus;
  }

  let nextState = patchFn(state, {
    lastVoiceCommand: transcript,
    investigationStatus: nextStatus,
    currentStepIndex: nextIndex,
    targetCircuitNumber:
      nextStatus === "completed"
        ? step.targetCircuitNumber ?? state.targetCircuitNumber
        : step.nextCircuitNumber ??
          nextStep?.targetCircuitNumber ??
          state.targetCircuitNumber,
  });

  if (nextStatus === "outage_confirmed" && !nextStep) {
    nextState = patchFn(nextState, {
      investigationStatus: "completed",
    });
  }

  return {
    state: nextState,
    prompt: promptAfterAck,
    advanced: true,
  };
}

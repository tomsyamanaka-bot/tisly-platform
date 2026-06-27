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

  const promptAfterAck = step.nextPrompt ?? null;
  const nextIndex = step.nextPrompt ? state.currentStepIndex : state.currentStepIndex + 1;
  const nextStep = steps[nextIndex];

  let nextStatus = step.nextStatus;
  if (step.nextPrompt) {
    nextStatus = "verifying_outage";
  } else if (!nextStep) {
    nextStatus = "completed";
  } else {
    nextStatus = nextStep.awaitStatus;
  }

  let nextState = patchFn(state, {
    lastVoiceCommand: transcript,
    investigationStatus: nextStatus,
    currentStepIndex: nextIndex,
  });

  if (nextStatus === "outage_confirmed") {
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

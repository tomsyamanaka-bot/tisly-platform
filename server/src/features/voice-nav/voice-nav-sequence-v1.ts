/**
 * 音声誘導ナビ v1 — 疑似対話シーケンス定義
 * Web Speech API モック用の
 * プロンプトとコマンド判定
 */
import {
  patchVoiceNavSessionV1,
  type VoiceNavSessionStateV1,
} from "./voice-nav-state-v1.js";

/** 職人の肯定応答パターン（部分一致） */
export const VOICE_NAV_ACK_PATTERNS: RegExp[] = [
  /落とした/,
  /落としました/,
  /オッケー/,
  /オーケー/,
  /了解/,
  /完了/,
  /^ok$/i,
  /オーケ/i,
];

/** シーケンス 1 ステップ */
export interface VoiceNavSequenceStepV1 {
  id: string;
  /** PWA が発話する指示文 */
  prompt: string;
  /** このステップで待つステータス */
  awaitStatus: VoiceNavSessionStateV1["investigationStatus"];
  /** 肯定応答後に遷移するステータス */
  nextStatus: VoiceNavSessionStateV1["investigationStatus"];
  /** 肯定応答後の次プロンプト（任意） */
  nextPrompt?: string;
}

/** デモ用 2 ステップシーケンス */
export function buildVoiceNavDemoSequenceV1(
  circuitNumber: number
): VoiceNavSequenceStepV1[] {
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

/** 音声テキストが肯定応答か判定 */
export function isVoiceNavAckCommandV1(transcript: string): boolean {
  const t = transcript.trim();
  if (!t) return false;
  return VOICE_NAV_ACK_PATTERNS.some((re) => re.test(t));
}

/** セッション開始 — 最初のステップへ */
export function startVoiceNavSequenceV1(
  state: VoiceNavSessionStateV1,
  steps: VoiceNavSequenceStepV1[]
): { state: VoiceNavSessionStateV1; prompt: string } {
  const first = steps[0];
  if (!first) {
    return {
      state: patchVoiceNavSessionV1(state, {
        investigationStatus: "error",
        lastError: "シーケンスが空です",
      }),
      prompt: "",
    };
  }
  return {
    state: patchVoiceNavSessionV1(state, {
      investigationStatus: first.awaitStatus,
      currentStepIndex: 0,
      startedAt: state.startedAt ?? new Date().toISOString(),
      lastError: null,
    }),
    prompt: first.prompt,
  };
}

/** 肯定応答を受けて次ステップへ進める */
export function advanceVoiceNavSequenceV1(
  state: VoiceNavSessionStateV1,
  steps: VoiceNavSequenceStepV1[],
  transcript: string
): {
  state: VoiceNavSessionStateV1;
  prompt: string | null;
  advanced: boolean;
} {
  if (!isVoiceNavAckCommandV1(transcript)) {
    return {
      state: patchVoiceNavSessionV1(state, {
        lastVoiceCommand: transcript,
      }),
      prompt: null,
      advanced: false,
    };
  }

  const step = steps[state.currentStepIndex];
  if (!step) {
    return {
      state: patchVoiceNavSessionV1(state, {
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

  const nextState = patchVoiceNavSessionV1(state, {
    lastVoiceCommand: transcript,
    investigationStatus: nextStatus,
    currentStepIndex: step.nextPrompt ? state.currentStepIndex : nextIndex,
  });

  if (nextStatus === "outage_confirmed" && !nextStep) {
    return {
      state: patchVoiceNavSessionV1(nextState, {
        investigationStatus: "completed",
      }),
      prompt: promptAfterAck,
      advanced: true,
    };
  }

  return {
    state: nextState,
    prompt: promptAfterAck,
    advanced: true,
  };
}

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
  /** このステップの対象回路番号（複数回路用） */
  targetCircuitNumber?: number;
  /** 次ステップの回路番号（複数回路用） */
  nextCircuitNumber?: number | null;
}

/** デモ用 2 ステップシーケンス（単回路） */
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

/**
 * 複数回路の連続停電チェック用シーケンス
 * 各回路: 落として → 停電検知 → 次回路へ
 */
export function buildVoiceNavMultiCircuitSequenceV1(
  circuitNumbers: number[]
): VoiceNavSequenceStepV1[] {
  const nums = circuitNumbers.filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return [];

  const steps: VoiceNavSequenceStepV1[] = [];
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
      targetCircuitNumber: first.targetCircuitNumber ?? state.targetCircuitNumber,
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
    currentStepIndex: nextIndex,
    targetCircuitNumber:
      nextStatus === "completed"
        ? step.targetCircuitNumber ?? state.targetCircuitNumber
        : step.nextCircuitNumber ??
          nextStep?.targetCircuitNumber ??
          state.targetCircuitNumber,
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

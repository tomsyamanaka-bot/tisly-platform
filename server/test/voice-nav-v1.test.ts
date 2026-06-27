import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_NAV_STATE_SCHEMA_VERSION,
  createInitialVoiceNavSessionV1,
  buildVoiceNavMqttTopicV1,
  patchVoiceNavSessionV1,
  buildVoiceNavDemoSequenceV1,
  buildVoiceNavMultiCircuitSequenceV1,
  isVoiceNavAckCommandV1,
  startVoiceNavSequenceV1,
  advanceVoiceNavSequenceV1,
} from "../src/features/voice-nav/index.js";

describe("voice-nav-v1 音声誘導基盤", () => {
  it("初期セッションに回路番号と MQTT トピックが入る", () => {
    const s = createInitialVoiceNavSessionV1(3);
    assert.equal(s.schemaVersion, VOICE_NAV_STATE_SCHEMA_VERSION);
    assert.equal(s.targetCircuitNumber, 3);
    assert.equal(s.investigationStatus, "idle");
    assert.equal(s.mqttRelayTopic, "tisly/relay/breaker/3/command");
    assert.equal(s.relayMode, "mock");
  });

  it("デモシーケンスの最初のプロンプトが回路番号付き", () => {
    const steps = buildVoiceNavDemoSequenceV1(1);
    assert.equal(steps.length, 2);
    assert.equal(steps[0].prompt, "1番ブレーカーを落としてください");
    assert.equal(steps[0].nextPrompt, "1番、停電確認中……");
  });

  it("肯定応答パターンを判定できる", () => {
    assert.equal(isVoiceNavAckCommandV1("落とした"), true);
    assert.equal(isVoiceNavAckCommandV1("オッケー"), true);
    assert.equal(isVoiceNavAckCommandV1("OK"), true);
    assert.equal(isVoiceNavAckCommandV1("まだ"), false);
  });

  it("スタートで awaiting_breaker_off に遷移する", () => {
    const initial = createInitialVoiceNavSessionV1(1);
    const steps = buildVoiceNavDemoSequenceV1(1);
    const { state, prompt } = startVoiceNavSequenceV1(initial, steps);
    assert.equal(state.investigationStatus, "awaiting_breaker_off");
    assert.ok(state.startedAt);
    assert.equal(prompt, "1番ブレーカーを落としてください");
  });

  it("「落とした」で停電確認プロンプトへ進む", () => {
    const initial = createInitialVoiceNavSessionV1(1);
    const steps = buildVoiceNavDemoSequenceV1(1);
    const started = startVoiceNavSequenceV1(initial, steps);
    const advanced = advanceVoiceNavSequenceV1(
      started.state,
      steps,
      "落とした"
    );
    assert.equal(advanced.advanced, true);
    assert.equal(advanced.prompt, "1番、停電確認中……");
    assert.equal(advanced.state.investigationStatus, "verifying_outage");
    assert.equal(advanced.state.lastVoiceCommand, "落とした");
  });

  it("patchVoiceNavSessionV1 で回路変更時に MQTT トピックが更新される", () => {
    const s = createInitialVoiceNavSessionV1(1);
    const next = patchVoiceNavSessionV1(s, { targetCircuitNumber: 5 });
    assert.equal(next.mqttRelayTopic, buildVoiceNavMqttTopicV1(5));
  });

  it("複数回路シーケンスで連続チェックが進む", () => {
    const steps = buildVoiceNavMultiCircuitSequenceV1([1, 2, 3]);
    assert.equal(steps.length, 3);
    assert.equal(steps[0].prompt, "1番ブレーカーを落としてください");
    assert.equal(steps[0].nextPrompt, "1番の停電を検知、次へ進みます。2番を落としてください");

    let state = createInitialVoiceNavSessionV1(1);
    const started = startVoiceNavSequenceV1(state, steps);
    state = started.state;
    assert.equal(started.prompt, "1番ブレーカーを落としてください");

    const step1 = advanceVoiceNavSequenceV1(state, steps, "落とした");
    assert.equal(step1.advanced, true);
    assert.match(step1.prompt ?? "", /1番の停電を検知/);
    assert.equal(step1.state.targetCircuitNumber, 2);
    assert.equal(step1.state.investigationStatus, "awaiting_breaker_off");

    const step2 = advanceVoiceNavSequenceV1(step1.state, steps, "落とした");
    assert.equal(step2.state.targetCircuitNumber, 3);

    const step3 = advanceVoiceNavSequenceV1(step2.state, steps, "落とした");
    assert.equal(step3.state.investigationStatus, "completed");
    assert.match(step3.prompt ?? "", /すべての回路チェックが完了/);
  });
});

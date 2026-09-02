/**
 * 社内向け Security 施工・保守 Pro v1
 *
 * 接点強制テスト / RP2350 再起動 /
 * Shelly コールドリブートを提供する。
 */

import { queueRp2350RelayPulseV1 } from "../device/rp2350-relay-pulse-v1.js";
import { shellyToggle } from "../device/shelly-real-client.js";
import { queueDeviceSoftRebootV1 } from "../remote-test/remote-test-state.js";
import {
  HOME_ITABASHI_LIVE_SITE_ID_V1,
  HOME_JP_TOYOSHIMA_SITE_ID_V1,
  findHomeSiteV1,
} from "./home-sites-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import {
  HOME_JP_TOYOSHIMA_SITE_ID_V1 as TOYOSHIMA_HOME_ID,
  isToyoshimaSecuritySiteIdV1,
  pulseToyoshimaDoV1,
  syncToyoshimaConfigToFirmwareV1,
  type ToyoshimaBuildingIdV1,
} from "./home-toyoshima-security-v1.js";

export interface HardwareTestOutputV1 {
  id: string;
  channel: number;
  label: string;
  building?: ToyoshimaBuildingIdV1;
  kind: "relay" | "patlite" | "light";
}

const ITABASHI_OUTPUTS_V1: HardwareTestOutputV1[] = [
  { id: "do1", channel: 1, label: "DO1 外側100Vライト", kind: "light" },
  { id: "do2", channel: 2, label: "DO2 100Vライト", kind: "light" },
  { id: "do3", channel: 3, label: "DO3 100Vライト", kind: "light" },
  { id: "do4", channel: 4, label: "DO4 予備", kind: "relay" },
  { id: "do5", channel: 5, label: "DO5 予備", kind: "relay" },
  { id: "do6", channel: 6, label: "DO6 予備", kind: "relay" },
  { id: "do7", channel: 7, label: "DO7 予備", kind: "relay" },
  { id: "do8", channel: 8, label: "DO8 パトライト", kind: "patlite" },
];

const TOYOSHIMA_OUTPUTS_V1: HardwareTestOutputV1[] = [
  {
    id: "main-do1",
    channel: 1,
    label: "母屋 DO1 防犯ライト1",
    building: "main",
    kind: "light",
  },
  {
    id: "main-do2",
    channel: 2,
    label: "母屋 DO2 防犯ライト2",
    building: "main",
    kind: "light",
  },
  {
    id: "main-do3",
    channel: 3,
    label: "母屋 DO3 パトライト",
    building: "main",
    kind: "patlite",
  },
  {
    id: "det-do1",
    channel: 1,
    label: "はなれ DO1 防犯ライト",
    building: "detached",
    kind: "light",
  },
  {
    id: "det-do2",
    channel: 2,
    label: "はなれ DO2 パトライト",
    building: "detached",
    kind: "patlite",
  },
  {
    id: "det-do3",
    channel: 3,
    label: "はなれ DO3 予備ライト",
    building: "detached",
    kind: "light",
  },
];

/** 物件別 強制出力テスト対象一覧 */
export function listHardwareTestOutputsV1(
  siteId: string
): HardwareTestOutputV1[] {
  const sid = String(siteId || "").trim();
  if (
    sid === HOME_JP_TOYOSHIMA_SITE_ID_V1 ||
    sid === TOYOSHIMA_HOME_ID
  ) {
    return [...TOYOSHIMA_OUTPUTS_V1];
  }
  return [...ITABASHI_OUTPUTS_V1];
}

export interface HardwareTestPulseInputV1 {
  siteId: string;
  outputId?: string;
  channel?: number;
  building?: ToyoshimaBuildingIdV1;
  durationMs?: number;
  actor?: string;
}

/** 1秒ワンショット強制出力テスト */
export function pulseHardwareOutputV1(
  input: HardwareTestPulseInputV1
): {
  ok: boolean;
  message: string;
  channel?: number;
  durationMs?: number;
  command?: string;
} {
  const siteId = String(input.siteId || "").trim();
  findHomeSiteV1(siteId);
  const durationMs = Math.max(
    500,
    Math.min(3000, Math.round(Number(input.durationMs) || 1000))
  );
  const actor = input.actor ?? "operator-pro";

  const outputs = listHardwareTestOutputsV1(siteId);
  let target = outputs.find((o) => o.id === input.outputId);
  if (!target && input.channel) {
    target = outputs.find(
      (o) =>
        o.channel === Number(input.channel) &&
        (!input.building || o.building === input.building)
    );
  }
  if (!target) {
    return { ok: false, message: "出力回路が見つかりません" };
  }

  if (
    siteId === HOME_JP_TOYOSHIMA_SITE_ID_V1 &&
    target.building
  ) {
    pulseToyoshimaDoV1({
      siteId,
      building: target.building,
      channel: target.channel as 1 | 2 | 3,
      durationMs,
      actor,
    });
    recordSystemLogV1({
      siteId,
      category: "manual_control",
      message: `強制出力テスト: ${target.label}`,
      detail: { outputId: target.id, durationMs },
      actor,
    });
    return {
      ok: true,
      message: `${target.label} を ${durationMs}ms テストONしました`,
      channel: target.channel,
      durationMs,
    };
  }

  const pulse = queueRp2350RelayPulseV1({
    channel: target.channel,
    durationMs,
    reason: `pro_test_${target.id}`,
  });
  if (!pulse.ok) {
    return {
      ok: false,
      message: pulse.error || "パルス送信に失敗しました",
    };
  }

  recordSystemLogV1({
    siteId,
    category: "manual_control",
    message: `強制出力テスト: ${target.label}`,
    detail: { outputId: target.id, pulse },
    actor,
  });

  return {
    ok: true,
    message: `${target.label} を ${durationMs}ms テストONしました`,
    channel: pulse.channel,
    durationMs: pulse.durationMs,
    command: pulse.command,
  };
}

/** RP2350 ソフト再起動コマンドをキュー */
export function softRebootRp2350V1(input: {
  siteId: string;
  actor?: string;
}): { ok: boolean; message: string; command?: string; queuedAt?: string } {
  const siteId = String(input.siteId || "").trim();
  findHomeSiteV1(siteId);
  const queued = queueDeviceSoftRebootV1();
  if (isToyoshimaSecuritySiteIdV1(siteId)) {
    syncToyoshimaConfigToFirmwareV1(siteId);
  }
  recordSystemLogV1({
    siteId,
    category: "manual_control",
    message: "RP2350 ソフト再起動を要求",
    detail: queued,
    actor: input.actor ?? "operator-pro",
  });
  return {
    ok: true,
    message: "RP2350 ソフト再起動をキューしました",
    command: queued.command,
    queuedAt: queued.queuedAt,
  };
}

/** Shelly 5秒OFF → 自動ON（コールドリブート） */
export async function shellyColdPowerCycleV1(input?: {
  actor?: string;
  siteId?: string;
}): Promise<{
  ok: boolean;
  message: string;
  offResult?: { ok: boolean; message: string };
  onResult?: { ok: boolean; message: string };
}> {
  const offResult = await shellyToggle({
    confirm: true,
    on: false,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const onResult = await shellyToggle({
    confirm: true,
    on: true,
  });
  if (input?.siteId) {
    recordSystemLogV1({
      siteId: input.siteId,
      category: "manual_control",
      message: "Shelly コールドリブート（5秒OFF→ON）",
      detail: { offResult, onResult },
      actor: input.actor ?? "operator-pro",
    });
  }
  return {
    ok: offResult.ok && onResult.ok,
    message: offResult.ok && onResult.ok
      ? "Shelly 電源を5秒OFF後、自動復帰ONしました"
      : "Shelly コールドリブートの一部が失敗しました",
    offResult: { ok: offResult.ok, message: offResult.message },
    onResult: { ok: onResult.ok, message: onResult.message },
  };
}

/** 板橋自宅かどうか（8CH 単一盤） */
export function isItabashiLiveSiteV1(siteId: string): boolean {
  return String(siteId).trim() === HOME_ITABASHI_LIVE_SITE_ID_V1;
}

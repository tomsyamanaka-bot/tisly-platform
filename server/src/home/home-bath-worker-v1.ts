/**
 * TiSLY HOME — 風呂タイマー / スケジュール Worker v1
 *
 * 15秒間隔で推定完了と
 * 予約実行をチェックする。
 */

import {
  syncAllBathEstimationsV1,
  hydrateAllHomeBathStatesV1,
} from "./home-bath-state-v1.js";
import { tickBathSchedulesV1 } from "./home-bath-schedule-v1.js";

let bootstrapped = false;

/** 起動時に DB から湯はり状態を復元 */
export function bootstrapHomeBathRuntimeV1(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    hydrateAllHomeBathStatesV1();
    console.log("[TiSLY HOME] bath state hydrated from SQLite");
  } catch (e) {
    console.warn(
      "[TiSLY HOME] bath hydrate failed:",
      e instanceof Error ? e.message : e
    );
  }
}

/** Worker tick — 推定完了 + 予約実行 */
export function runHomeBathWorkerTickV1(): {
  estimationsCompleted: number;
  schedulesExecuted: number;
} {
  bootstrapHomeBathRuntimeV1();
  const estimationsCompleted = syncAllBathEstimationsV1();
  const schedulesExecuted = tickBathSchedulesV1();
  return { estimationsCompleted, schedulesExecuted };
}

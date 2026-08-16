/**
 * TiSLY HOME — SwitchBot 実機状態の同期
 *
 * ダッシュボード取得前に呼び、設定済みならロック状態を上書き。
 * 未設定・失敗時はモック値を維持（例外は投げない）。
 */

import {
  getSwitchBotHomeEnvV1,
  getSwitchBotLockStatusV1,
  isSwitchBotLockConfiguredV1,
} from "./switchbot_client.js";
import {
  findHomeSiteV1,
  type HomeSiteV1,
} from "./home-sites-v1.js";

export interface HomeSwitchBotSyncResultV1 {
  ok: boolean;
  synced: boolean;
  skipped?: boolean;
  error?: string;
  siteId: string;
}

/**
 * SwitchBot から玄関ロック状態を取得し site.lock へ反映
 */
export async function syncHomeLockFromSwitchBotV1(
  siteId?: string | null
): Promise<HomeSwitchBotSyncResultV1> {
  const site = findHomeSiteV1(siteId);
  const env = getSwitchBotHomeEnvV1();
  if (!isSwitchBotLockConfiguredV1(env)) {
    return {
      ok: true,
      synced: false,
      skipped: true,
      siteId: site.id,
    };
  }
  try {
    const result = await getSwitchBotLockStatusV1(env.lockDeviceId, env);
    if (!result.ok || !result.data) {
      return {
        ok: false,
        synced: false,
        skipped: result.skipped,
        error: result.error,
        siteId: site.id,
      };
    }
    applyLockStatusToSiteV1(site, result.data.lockState, result.data.doorState, result.data.battery);
    return { ok: true, synced: true, siteId: site.id };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "SwitchBot lock sync failed";
    return { ok: false, synced: false, error: msg, siteId: site.id };
  }
}

export function applyLockStatusToSiteV1(
  site: HomeSiteV1,
  lockState: string,
  doorState: string,
  battery: number | null
): void {
  const upper = String(lockState).toUpperCase();
  if (upper === "LOCKED" || upper === "LOCK") {
    site.lock.locked = true;
  } else if (upper === "UNLOCKED" || upper === "UNLOCK") {
    site.lock.locked = false;
  }
  const door = String(doorState).toLowerCase();
  if (door === "open" || door === "opened") {
    site.lock.doorOpen = true;
  } else if (door === "close" || door === "closed") {
    site.lock.doorOpen = false;
  }
  if (typeof battery === "number" && Number.isFinite(battery)) {
    site.lock.batteryPercent = Math.max(0, Math.min(100, Math.round(battery)));
  }
}

/**
 * オペレーター一覧用 — 代表物件（JP デフォルト）だけ同期
 * （全物件を同一ロックに束ねないため、デフォルト物件のみ）
 */
export async function syncHomeDefaultLockFromSwitchBotV1(): Promise<HomeSwitchBotSyncResultV1> {
  return syncHomeLockFromSwitchBotV1(undefined);
}

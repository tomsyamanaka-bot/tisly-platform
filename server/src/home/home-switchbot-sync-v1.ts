/**
 * TiSLY HOME — SwitchBot 実機状態の同期
 *
 * ダッシュボード取得前に呼び、設定済みならロック・温湿度・電源状態を上書き。
 * 未設定・失敗時はモック値を維持（例外は投げない）。
 */

import {
  getSwitchBotDeviceStatusV1,
  getSwitchBotHomeEnvV1,
  getSwitchBotLockStatusV1,
  isSwitchBotHomeConfiguredV1,
} from "./switchbot_client.js";
import { resolveHomeSwitchBotMapV1 } from "./home-switchbot-map-v1.js";
import {
  findHomeSiteV1,
  HOME_ITABASHI_LIVE_SITE_ID_V1,
  type HomeSiteV1,
} from "./home-sites-v1.js";

export interface HomeSwitchBotSyncResultV1 {
  ok: boolean;
  synced: boolean;
  skipped?: boolean;
  error?: string;
  siteId: string;
  details?: {
    lock?: boolean;
    meter?: boolean;
    switches?: number;
  };
}

/**
 * SwitchBot から玄関ロック状態を取得し site.lock へ反映
 */
export async function syncHomeLockFromSwitchBotV1(
  siteId?: string | null
): Promise<HomeSwitchBotSyncResultV1> {
  const site = findHomeSiteV1(siteId);
  const env = getSwitchBotHomeEnvV1();
  const map = await resolveHomeSwitchBotMapV1({ env });
  const lockId = map.lock || env.lockDeviceId;
  if (!isSwitchBotHomeConfiguredV1(env) || !lockId) {
    return {
      ok: true,
      synced: false,
      skipped: true,
      siteId: site.id,
    };
  }
  try {
    const result = await getSwitchBotLockStatusV1(lockId, env);
    if (!result.ok || !result.data) {
      return {
        ok: false,
        synced: false,
        skipped: result.skipped,
        error: result.error,
        siteId: site.id,
      };
    }
    applyLockStatusToSiteV1(
      site,
      result.data.lockState,
      result.data.doorState,
      result.data.battery
    );
    return {
      ok: true,
      synced: true,
      siteId: site.id,
      details: { lock: true },
    };
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

async function syncMeterAndSwitchesV1(
  site: HomeSiteV1
): Promise<{ meter: boolean; switches: number }> {
  const env = getSwitchBotHomeEnvV1();
  if (!isSwitchBotHomeConfiguredV1(env)) {
    return { meter: false, switches: 0 };
  }
  const map = await resolveHomeSwitchBotMapV1({ env });
  let meterOk = false;
  let switchCount = 0;
  const at = new Date().toISOString();

  if (map.meter && site.meter) {
    const st = await getSwitchBotDeviceStatusV1(map.meter, env);
    if (st.ok && st.data) {
      if (st.data.temperatureC !== null) {
        site.meter.temperatureC = st.data.temperatureC;
        // リビングエアコンの室温表示にも反映
        const ac = site.aircons.find((a) => a.deviceKey === "ac-living");
        if (ac) ac.roomTempC = st.data.temperatureC;
      }
      if (st.data.humidityPercent !== null) {
        site.meter.humidityPercent = st.data.humidityPercent;
      }
      site.meter.syncedAt = at;
      meterOk = true;
    }
  }

  const switchRoleByKey: Record<
    string,
    "ceiling" | "tv" | "humidifier" | "plug"
  > = {
    "ceiling-yoma": "ceiling",
    "tv-1": "tv",
    "humidifier-yoma": "humidifier",
    "plug-three": "plug",
  };

  for (const sw of site.iotSwitches ?? []) {
    const role = switchRoleByKey[sw.deviceKey];
    if (!role) continue;
    const deviceId = String(map[role] || "").trim();
    if (!deviceId) continue;
    // IR TV は status が取れないことが多いのでスキップ可
    const st = await getSwitchBotDeviceStatusV1(deviceId, env);
    if (st.ok && st.data && st.data.power !== null) {
      sw.power = st.data.power;
      sw.updatedAt = at;
      switchCount += 1;
    }
  }

  return { meter: meterOk, switches: switchCount };
}

/**
 * ロック + 温湿度 + IoT スイッチを一括同期
 */
export async function syncHomeSwitchBotDevicesV1(
  siteId?: string | null
): Promise<HomeSwitchBotSyncResultV1> {
  const site = findHomeSiteV1(siteId);
  const lock = await syncHomeLockFromSwitchBotV1(site.id);
  let meter = false;
  let switches = 0;
  try {
    const extra = await syncMeterAndSwitchesV1(site);
    meter = extra.meter;
    switches = extra.switches;
  } catch {
    // 部分失敗は許容
  }
  const synced = Boolean(lock.synced || meter || switches > 0);
  return {
    ok: lock.ok !== false,
    synced,
    skipped: lock.skipped && !meter && switches === 0,
    error: lock.error,
    siteId: site.id,
    details: {
      lock: Boolean(lock.synced),
      meter,
      switches,
    },
  };
}

/**
 * オペレーター一覧用 — 実機物件（板橋）を同期
 * （デモ物件へ同一ロック状態を流し込まない）
 */
export async function syncHomeDefaultLockFromSwitchBotV1(): Promise<HomeSwitchBotSyncResultV1> {
  return syncHomeSwitchBotDevicesV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
}

/** 互換エイリアス */
export async function syncHomeLiveDevicesFromSwitchBotV1(): Promise<HomeSwitchBotSyncResultV1> {
  return syncHomeDefaultLockFromSwitchBotV1();
}

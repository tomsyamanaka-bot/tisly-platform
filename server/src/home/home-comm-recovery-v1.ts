/**
 * 途絶のあと、通信が戻ったことを知らせる。
 * 点検中と 15 分以内の再通知は送らない。
 * 実機ファームの版は変えない。
 */

import fs from "fs";
import path from "path";
import { canonicalOpsSiteKeyV1 } from "./home-ops-safety-v1.js";
import { recordSystemLogV1 } from "./home-system-log-v1.js";
import { sendWebPush } from "../notification/channels/web-push.js";

export const COMM_RECOVERY_COOLDOWN_MS_V1 = 15 * 60 * 1000;

interface DeviceSlotV1 {
  offlineSince: number | null;
  offlineNotified: boolean;
}

interface SiteSlotV1 {
  devices: Record<string, DeviceSlotV1>;
  lastRecoveryPushAt: number | null;
}

interface RecoveryStoreV1 {
  sites: Record<string, SiteSlotV1>;
}

export interface CommRecoveryPlanV1 {
  action: "ignore" | "log" | "push";
  reason: "not-offline" | "maintenance" | "not-notified" | "cooldown" | "sent";
  downtimeLabel: string | null;
  logMessage: string;
  staffTitle: string;
  customerTitle: string;
}

let persistOn = false;
let memory: RecoveryStoreV1 = { sites: {} };

function emptyStore(): RecoveryStoreV1 {
  return { sites: {} };
}

function storePath(): string {
  return path.join(process.cwd(), "data", "comm-recovery-v1.json");
}

function loadStore(): RecoveryStoreV1 {
  if (!persistOn) return memory;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(storePath(), "utf8")
    ) as Partial<RecoveryStoreV1>;
    return { sites: parsed.sites ?? {} };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: RecoveryStoreV1): void {
  if (!persistOn) {
    memory = store;
    return;
  }
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), "utf8");
  fs.renameSync(tmp, file);
}

function siteOf(store: RecoveryStoreV1, siteId: string): SiteSlotV1 {
  const key = canonicalOpsSiteKeyV1(siteId);
  if (!store.sites[key]) {
    store.sites[key] = { devices: {}, lastRecoveryPushAt: null };
  }
  return store.sites[key];
}

function deviceOf(site: SiteSlotV1, deviceKey: string): DeviceSlotV1 {
  const key = deviceKey || "main";
  if (!site.devices[key]) {
    site.devices[key] = { offlineSince: null, offlineNotified: false };
  }
  return site.devices[key];
}

/** 本番ワーカーだけファイルへ残す。 */
export function enableCommRecoveryPersistV1(): void {
  persistOn = true;
  memory = loadStore();
}

export function resetCommRecoveryForTestV1(): void {
  persistOn = false;
  memory = emptyStore();
}

export function formatDowntimeJaV1(elapsedMs: number): string {
  const min = Math.max(1, Math.round(elapsedMs / 60_000));
  if (min < 60) return `約${min}分`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

/** 5分30秒を超えてオフラインになった時刻。 */
export function noteCommOfflineV1(
  siteId: string,
  deviceKey: string,
  atMs: number,
  notified: boolean
): void {
  const store = loadStore();
  const device = deviceOf(siteOf(store, siteId), deviceKey);
  if (device.offlineSince == null) device.offlineSince = atMs;
  if (notified) device.offlineNotified = true;
  saveStore(store);
}

export function peekCommOfflineV1(
  siteId: string,
  deviceKey: string
): { offlineSince: number | null; offlineNotified: boolean } {
  const store = loadStore();
  const device = deviceOf(siteOf(store, siteId), deviceKey);
  return {
    offlineSince: device.offlineSince,
    offlineNotified: device.offlineNotified,
  };
}

export function takeCommRecoveryV1(input: {
  siteId: string;
  deviceKey?: string;
  siteName: string;
  atMs?: number;
  maintenance: boolean;
}): CommRecoveryPlanV1 {
  const atMs = input.atMs ?? Date.now();
  const store = loadStore();
  const site = siteOf(store, input.siteId);
  const device = deviceOf(site, input.deviceKey || "main");
  const blank: CommRecoveryPlanV1 = {
    action: "ignore",
    reason: "not-offline",
    downtimeLabel: null,
    logMessage: "",
    staffTitle: "",
    customerTitle: "",
  };
  if (device.offlineSince == null) {
    saveStore(store);
    return blank;
  }
  const label = formatDowntimeJaV1(atMs - device.offlineSince);
  const notified = device.offlineNotified;
  device.offlineSince = null;
  device.offlineNotified = false;
  const name = input.siteName || "現場";
  const logMessage = `🟢 通信復旧（停止時間：${label}）`;
  const staffTitle =
    `🟢 【通信復旧】[社内] ${name}：` +
    `通信が正常に復帰しました（停止時間：${label}）`;
  const customerTitle =
    `🟢 【通信復旧】${name}：` +
    `システムの通信が正常に復帰しました（停止時間：${label}）`;
  const base = {
    downtimeLabel: label,
    logMessage,
    staffTitle,
    customerTitle,
  };
  if (input.maintenance) {
    saveStore(store);
    return { action: "log", reason: "maintenance", ...base };
  }
  if (!notified) {
    saveStore(store);
    return { action: "log", reason: "not-notified", ...base };
  }
  const last = site.lastRecoveryPushAt;
  if (last != null && atMs - last < COMM_RECOVERY_COOLDOWN_MS_V1) {
    saveStore(store);
    return { action: "log", reason: "cooldown", ...base };
  }
  site.lastRecoveryPushAt = atMs;
  saveStore(store);
  return { action: "push", reason: "sent", ...base };
}

export async function deliverCommRecoveryV1(input: {
  siteId: string;
  deviceKey?: string;
  siteName: string;
  atMs?: number;
  maintenance: boolean;
}): Promise<CommRecoveryPlanV1> {
  const plan = takeCommRecoveryV1(input);
  if (plan.action === "ignore") return plan;
  try {
    recordSystemLogV1({
      siteId: input.siteId,
      category: "rp2350_comm",
      message: plan.logMessage,
      detail: {
        reason: plan.reason,
        downtime: plan.downtimeLabel,
        deviceKey: input.deviceKey || "main",
      },
      actor: "comm-recovery",
    });
  } catch (err) {
    console.error(
      "Push Send Error:",
      err instanceof Error ? err.message : String(err)
    );
  }
  if (plan.action !== "push") return plan;
  const siteId = input.siteId;
  try {
    await sendWebPush({
      title: plan.staffTitle,
      body: plan.logMessage,
      eventType: "comm_recovery",
      deviceId: siteId,
      url: "/app/security",
      audience: "toms",
      data: { siteId, audience: "toms" },
    });
    await sendWebPush({
      title: plan.customerTitle,
      body: plan.logMessage,
      eventType: "comm_recovery",
      deviceId: siteId,
      url: "/customer/security",
      audience: "customer",
      data: { siteId, audience: "customer" },
    });
  } catch (err) {
    console.error(
      "Push Send Error:",
      err instanceof Error ? err.message : String(err)
    );
  }
  return plan;
}

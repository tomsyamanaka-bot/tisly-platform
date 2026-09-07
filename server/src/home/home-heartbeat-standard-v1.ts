/**
 * TiSLY ハートビート死活監視の標準定数
 * 実機 300 秒周期 · VPS は 5 分 30 秒で途絶判定
 * （ネットワーク揺らぎを見込んだ猶予）
 */

/** 実機 heartbeat 送信周期（秒） */
export const TISLY_HEARTBEAT_INTERVAL_SEC_V1 = 300;

/**
 * 通信途絶とみなす猶予（ms）
 * 5 分周期 + 30 秒の揺らぎ余裕 = 5 分 30 秒
 */
export const TISLY_HEARTBEAT_OFFLINE_MS_V1 = 5 * 60 * 1000 + 30 * 1000;

/** 表示用ラベル（秒） */
export const TISLY_HEARTBEAT_OFFLINE_LABEL_V1 = "5分30秒";

/**
 * Shelly 自動コールドリブートしきい値（ms）
 * 2 回連続未受信（10 分）+ 30 秒揺らぎ = 10 分 30 秒
 */
export const TISLY_SHELLY_AUTO_REBOOT_MS_V1 = 10 * 60 * 1000 + 30 * 1000;

/** Shelly キック表示ラベル */
export const TISLY_SHELLY_AUTO_REBOOT_LABEL_V1 = "10分30秒";

/** Shelly 自動キック最大回数（同一途絶期間） */
export const TISLY_SHELLY_AUTO_REBOOT_MAX_RETRIES_V1 = 2;

/**
 * 途絶 Push タイトル
 * 例: ⚠️ 【緊急】豊島邸：主装置との通信が途絶えました
 */
export function buildHeartbeatCommLossPushTitleV1(input: {
  siteDisplayName: string;
  deviceLabel: string;
}): string {
  const name = String(input.siteDisplayName || "現場").trim();
  const device = String(input.deviceLabel || "主装置").trim();
  return `⚠️ 【緊急】${name}：${device}との通信が途絶えました`;
}

/**
 * 途絶 Push 本文
 * （5分以上ハートビート未受信）を明示
 */
export function buildHeartbeatCommLossPushBodyV1(input: {
  deviceLabel: string;
}): string {
  const device = String(input.deviceLabel || "主装置").trim();
  return `${device}との通信が途絶えました（5分以上ハートビート未受信）`;
}

/** lastHeartbeat からの経過でオンラインか */
export function isHeartbeatOnlineV1(
  lastHeartbeatAt: string | null | undefined,
  nowMs: number = Date.now(),
  offlineMs: number = TISLY_HEARTBEAT_OFFLINE_MS_V1
): boolean {
  if (!lastHeartbeatAt) return false;
  const at = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(at)) return false;
  return nowMs - at < offlineMs;
}

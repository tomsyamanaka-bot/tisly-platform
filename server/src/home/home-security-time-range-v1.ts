/**
 * 防犯ライト点灯時間帯の判定（日またぎ対応）
 * 板橋自宅・豊島邸など HOME 系で共用する。
 * 現在時刻は常に Asia/Tokyo（JST）で評価する。
 * VPS が UTC でも誤判定しない。
 *
 * Intl の hour12 無視や 24:00 表記に依存せず、
 * JST=UTC+9（日本は DST なし）で分を算出する。
 */

const JST_OFFSET_MS_V1 = 9 * 60 * 60 * 1000;
const MINUTES_PER_DAY_V1 = 24 * 60;

/** JST の「その日の分」（0〜1439）を返す */
export function getJstMinutesOfDayV1(at: Date = new Date()): number {
  const ms = at instanceof Date ? at.getTime() : Date.now();
  if (!Number.isFinite(ms)) return 0;
  /* UTC ミリ秒へ +9h し、UTC ゲッタで JST 時分を読む */
  const jst = new Date(ms + JST_OFFSET_MS_V1);
  const hour = jst.getUTCHours();
  const minute = jst.getUTCMinutes();
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return ((hour * 60 + minute) % MINUTES_PER_DAY_V1 + MINUTES_PER_DAY_V1) %
    MINUTES_PER_DAY_V1;
}

/**
 * 開始〜終了の時間帯内か。
 * 同日: 09:00〜17:00 → start <= end
 * 日跨ぎ: 18:00〜06:00 → start > end
 * 開始=終了は 24 時間有効として扱う。
 */
export const isWithinTimeRange = (
  startTimeStr: string,
  endTimeStr: string,
  now: Date = new Date()
): boolean => {
  const currentMinutes = getJstMinutesOfDayV1(now);
  const [startH, startM] = String(startTimeStr)
    .split(":")
    .map(Number);
  const [endH, endM] = String(endTimeStr).split(":").map(Number);
  if (
    !Number.isFinite(startH) ||
    !Number.isFinite(startM) ||
    !Number.isFinite(endH) ||
    !Number.isFinite(endM)
  ) {
    return false;
  }
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  /* 開始=終了 → 終日点灯 */
  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    // 同日内の時間帯（例: 09:00 〜 17:00）
    return (
      currentMinutes >= startMinutes &&
      currentMinutes < endMinutes
    );
  }
  // 日をまたぐ時間帯（例: 18:00 〜 06:00）
  return (
    currentMinutes >= startMinutes ||
    currentMinutes < endMinutes
  );
};
